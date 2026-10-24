param(
  [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$SourceSha,
  [ValidateSet('default','ivy-thin8','ivy-thin1','ivy-fat1')][string]$Profile='ivy-thin8',
  [switch]$SkipPrepare
)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$app=Join-Path $root 'apps\examples\desktop-app'
if(-not $env:CARGO_HOME){$env:CARGO_HOME=Join-Path $env:USERPROFILE '.cargo'}
if(-not $env:BUN_INSTALL_CACHE_DIR){$env:BUN_INSTALL_CACHE_DIR=Join-Path $root '.build-cache\bun'}
$env:PATH="${env:ProgramFiles}\Git\usr\bin;$env:PATH"
Push-Location $root
try {
  if((git rev-parse HEAD).Trim() -ne $SourceSha){throw 'Checkout does not match the pinned source SHA'}
  if((bun --version).Trim() -ne '1.4.2'){throw 'Bun 1.4.2 is required'}
  if((rustc --version) -notmatch '^rustc 1\.97\.0 '){throw 'Rust 1.97.0 is required'}
  if(-not $env:VCToolsInstallDir -or $env:VCToolsInstallDir.TrimEnd('\') -notmatch '\\14\.44\.35207$'){throw 'MSVC toolset 14.44.35207 is required'}
  if($env:WindowsSDKVersion.TrimEnd('\') -ne '10.0.26100.0'){throw 'Windows SDK 10.0.26100.0 is required'}
  $env:CARGO_BUILD_JOBS='6'
  $env:NEXT_TELEMETRY_DISABLED='1'
  $env:CLINE_NO_AUTO_UPDATE='1'
  # No telemetry credentials or private exporter addresses enter a public bundle.
  foreach($key in @('TELEMETRY_SERVICE_API_KEY','ERROR_SERVICE_API_KEY','OTEL_EXPORTER_OTLP_ENDPOINT','OTEL_EXPORTER_OTLP_HEADERS','CLINE_CODE_CLOUD_AGENTS')){Remove-Item "Env:$key" -ErrorAction SilentlyContinue}
  $env:OTEL_TELEMETRY_ENABLED='0'
  $env:OTEL_LOGS_EXPORTER='none';$env:OTEL_METRICS_EXPORTER='none';$env:OTEL_TRACES_EXPORTER='none'
  $env:CC_ENABLE_DEBUG_OUTPUT='1';$env:CLINE_TRACE_RECORD_CONTENT='0'
  if(-not $SkipPrepare){
    bun install --frozen-lockfile
    if($LASTEXITCODE){throw 'Dependency installation failed'}
    python (Join-Path $PSScriptRoot 'seed-bun.py')
    if($LASTEXITCODE){throw 'Runtime verification failed'}
    bun -F @cline/code build:runtime
    if($LASTEXITCODE){throw 'CLI/Hub/backend build failed'}
    cargo fetch --locked --manifest-path "$app\src-tauri\Cargo.toml"
    if($LASTEXITCODE){throw 'Cargo lock verification failed'}
    python (Join-Path $PSScriptRoot 'collect-licenses.py')
    if($LASTEXITCODE){throw 'License inventory failed'}
    bun -F @cline/code typecheck
    if($LASTEXITCODE){throw 'Type checking failed'}
    bun -F @cline/code build:web
    if($LASTEXITCODE){throw 'Production frontend build failed'}
    Push-Location $app
    try { bun x vitest run --config vitest.config.ts; if($LASTEXITCODE){throw 'Desktop tests failed'} }
    finally {Pop-Location}
  }
  $env:RUSTFLAGS="--remap-path-prefix=$root=/src/cline"
  if($env:CARGO_HOME){$env:RUSTFLAGS+=" --remap-path-prefix=$env:CARGO_HOME=/src/cargo"}
  $env:CARGO_PROFILE_RELEASE_OPT_LEVEL='3'
  $env:CARGO_PROFILE_RELEASE_DEBUG='0'
  if($Profile -eq 'default'){
    $env:CARGO_PROFILE_RELEASE_LTO='false';$env:CARGO_PROFILE_RELEASE_CODEGEN_UNITS='16'
  }else{
    $env:RUSTFLAGS+=' -C target-cpu=ivybridge -C target-feature=-avx2,-fma'
    $env:CARGO_PROFILE_RELEASE_LTO=if($Profile -eq 'ivy-fat1'){'fat'}else{'thin'}
    $env:CARGO_PROFILE_RELEASE_CODEGEN_UNITS=if($Profile -eq 'ivy-thin8'){'8'}else{'1'}
  }
  Push-Location $app
  try {
    cargo test --locked --release --manifest-path src-tauri\Cargo.toml
    if($LASTEXITCODE){throw 'Native tests failed'}
    bun tauri build --bundles nsis --config src-tauri\tauri.prepared.conf.json --verbose
    if($LASTEXITCODE){throw 'Native installer build failed'}
  }finally{Pop-Location}
  $target=if($env:CARGO_TARGET_DIR){$env:CARGO_TARGET_DIR}else{"$app\src-tauri\target"}
  $installers=@(Get-ChildItem "$target\release\bundle\nsis" -Filter '*.exe')
  if($installers.Count -ne 1){throw 'Expected one NSIS installer'}
  $output=Join-Path $root 'dist\avx1';New-Item -ItemType Directory -Path $output -Force|Out-Null
  $exe=Join-Path $output 'Cline-Desktop-AVX1-RU-Setup.exe';Copy-Item -LiteralPath $installers[0].FullName -Destination $exe -Force
  [ordered]@{source_sha=$SourceSha;profile=$Profile;sha256=(Get-FileHash $exe -Algorithm SHA256).Hash.ToLowerInvariant();size=(Get-Item $exe).Length;rustflags=$env:RUSTFLAGS.Replace($root,'<source>').Replace($env:CARGO_HOME,'<cargo>');lto=$env:CARGO_PROFILE_RELEASE_LTO;codegen_units=$env:CARGO_PROFILE_RELEASE_CODEGEN_UNITS;hardware_qualification='required on Ivy Bridge before publication'} | ConvertTo-Json | Set-Content "$output\manifest.json" -Encoding utf8
}finally{Pop-Location}
