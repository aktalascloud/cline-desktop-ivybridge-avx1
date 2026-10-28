param(
  [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$SourceSha,
  [ValidateSet('default','ivy-thin8','ivy-thin1','ivy-fat1')][string]$Profile='ivy-fat1',
  [switch]$SkipPrepare,
  [ValidateSet('minimal','full')][string]$Checks='minimal'
)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$app=Join-Path $root 'apps\examples\desktop-app'
if(-not $env:CARGO_HOME){$env:CARGO_HOME=Join-Path $env:USERPROFILE '.cargo'}
if(-not $env:BUN_INSTALL_CACHE_DIR){$env:BUN_INSTALL_CACHE_DIR=Join-Path $root '.build-cache\bun'}
$env:PATH="$env:VCToolsInstallDir\bin\Hostx64\x64;${env:ProgramFiles}\Git\usr\bin;$env:PATH"
Push-Location $root
try {
  if((git rev-parse HEAD).Trim() -ne $SourceSha){throw 'Checkout does not match the pinned source SHA'}
  $configuration=Get-Content "$app/src-tauri/tauri.conf.json" -Raw|ConvertFrom-Json
  $package=Get-Content "$app/package.json" -Raw|ConvertFrom-Json
  $changelogVersion=[regex]::Match((Get-Content "$app/CHANGELOG.md" -Raw),'(?m)^## ([^\r\n ]+)').Groups[1].Value
  if($package.version -ne $configuration.version -or $package.version -ne $changelogVersion){throw 'Package, native and changelog versions must match before building'}
  $baseline=(Get-Content "$PSScriptRoot/components.json" -Raw|ConvertFrom-Json).build_source_sha
  $nativeChanges=@(git diff --name-only $baseline -- apps/examples/desktop-app/src-tauri/src apps/examples/desktop-app/src-tauri/Cargo.toml apps/examples/desktop-app/src-tauri/Cargo.lock apps/examples/desktop-app/src-tauri/build.rs rust-toolchain.toml)

  if((bun --version).Trim() -ne '1.4.2'){throw 'Bun 1.4.2 is required'}
  if((node --version).Trim() -ne 'v24.20.0'){throw 'Node 24.20.0 is required'}
  if((python --version).Trim() -ne 'Python 3.13.14'){throw 'Python 3.13.14 is required'}
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
    python (Join-Path $PSScriptRoot 'prepare-dsw2api.py')
    if($LASTEXITCODE){throw 'DSW2API bundled runtime verification failed'}
    python (Join-Path $PSScriptRoot 'prepare-browser-bridge.py')
    if($LASTEXITCODE){throw 'Browser session bridge build failed'}
    & "$app/src-tauri/bin/dsw2api/runtime/python.exe" -I -B -X utf8 "$PSScriptRoot/dsw2api/test-managed.py" "$app/src-tauri/bin/dsw2api"
    if($LASTEXITCODE){throw 'DSW2API offline protocol and credential-preservation checks failed'}
    python ./fork/check-bundle-paths.py
    if($LASTEXITCODE){throw 'Generated runtime privacy check failed'}
    bun test fork/logging-bundle.test.ts
    if($LASTEXITCODE){throw 'Relocatable logger worker tests failed'}
    & "$app\src-tauri\bin\cline-cli-x86_64-pc-windows-msvc.exe" --version
    if($LASTEXITCODE){throw 'Compiled CLI execution failed'}
    cargo fetch --locked --manifest-path "$app\src-tauri\Cargo.toml"
    if($LASTEXITCODE){throw 'Cargo lock verification failed'}
    python (Join-Path $PSScriptRoot 'collect-licenses.py')
    if($LASTEXITCODE){throw 'License inventory failed'}
    python (Join-Path $PSScriptRoot 'seed-nsis.py')
    if($LASTEXITCODE){throw 'NSIS tool verification failed'}
    $env:MAKENSIS_PATH=Join-Path $root '.build-cache\nsis\nsis-3.13\makensis.exe'
    bun -F @cline/code test:windows-installer
    if($LASTEXITCODE){throw 'Real Windows installer hook tests failed'}
    & "$PSScriptRoot/validate-windows.ps1" -Mode $Checks -BaselineSha $baseline
    bun -F @cline/code build:web
    if($LASTEXITCODE){throw 'Production frontend build failed'}

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
    if($Checks -eq 'full' -or $nativeChanges.Count){
      cargo test --locked --release --manifest-path src-tauri\Cargo.toml
      if($LASTEXITCODE){throw 'Native tests failed'}
    }
    bun tauri build --bundles nsis --config src-tauri\tauri.prepared.conf.json --verbose -- --locked
    if($LASTEXITCODE){throw 'Native installer build failed'}
  }finally{Pop-Location}
  $target=if($env:CARGO_TARGET_DIR){$env:CARGO_TARGET_DIR}else{"$app\src-tauri\target"}
  $installers=@(Get-ChildItem "$target\release\bundle\nsis" -Filter ("Cline Desktop AVX1 RU_"+$configuration.version+"_x64-setup.exe"))
  if($installers.Count -ne 1){throw 'Expected one NSIS installer'}
  $output=Join-Path $root 'dist\avx1';New-Item -ItemType Directory -Path $output -Force|Out-Null
  $exe=Join-Path $output 'Cline-Desktop-AVX1-RU-Setup.exe';Copy-Item -LiteralPath $installers[0].FullName -Destination $exe -Force
  $publicKeyFile=Join-Path $PSScriptRoot 'updater\public-key.txt'
  $configuredKey=(Get-Content "$app\src-tauri\tauri.conf.json" -Raw|ConvertFrom-Json).plugins.updater.pubkey
  if((Get-Content -LiteralPath $publicKeyFile -Raw).Trim() -ne $configuredKey){throw 'Updater public-key copies differ'}
  cargo run --locked --release --target-dir (Join-Path $root '.build-cache\updater-verifier') --manifest-path (Join-Path $PSScriptRoot 'verify-updater\Cargo.toml') -- $exe $publicKeyFile ($installers[0].FullName+'.sig')
  if($LASTEXITCODE){throw 'Updater signature/tamper verification failed'}
  [ordered]@{source_sha=$SourceSha;profile=$Profile;sha256=(Get-FileHash $exe -Algorithm SHA256).Hash.ToLowerInvariant();size=(Get-Item $exe).Length;rustflags=$env:RUSTFLAGS.Replace($root,'<source>').Replace($env:CARGO_HOME,'<cargo>');lto=$env:CARGO_PROFILE_RELEASE_LTO;codegen_units=$env:CARGO_PROFILE_RELEASE_CODEGEN_UNITS;hardware_qualification='required on Ivy Bridge before publication'} | ConvertTo-Json | Set-Content "$output\manifest.json" -Encoding utf8
}finally{Pop-Location}
