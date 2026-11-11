$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$app = Join-Path $root 'apps/examples/desktop-app'
function Invoke-Checked([scriptblock]$command) {
    & $command
    if ($LASTEXITCODE) { throw "Build step failed: $command" }
}
Push-Location $root
try {
    Invoke-Checked { python fork/check-patches.py }
    if ((bun --version).Trim() -ne '1.4.2') { throw 'Bun 1.4.2 baseline is required' }
    if ((rustc --version) -notmatch '^rustc 1\.97\.0 ') { throw 'Rust 1.97.0 is required' }
    $env:NEXT_TELEMETRY_DISABLED = '1'
    $env:OTEL_TELEMETRY_ENABLED = '0'
    $env:CARGO_PROFILE_RELEASE_OPT_LEVEL = '3'
    $env:CARGO_PROFILE_RELEASE_DEBUG = '0'
    $env:CARGO_PROFILE_RELEASE_LTO = 'fat'
    $env:CARGO_PROFILE_RELEASE_CODEGEN_UNITS = '1'
    $cargoHome = if ($env:CARGO_HOME) { $env:CARGO_HOME } else { Join-Path $env:USERPROFILE '.cargo' }
    $env:CARGO_ENCODED_RUSTFLAGS = @("--remap-path-prefix=$root=/src/cline", "--remap-path-prefix=$cargoHome=/src/cargo", '-C', 'target-cpu=ivybridge', '-C', 'target-feature=-avx2,-fma') -join [char]0x1f
    Invoke-Checked { bun install --frozen-lockfile }
    Invoke-Checked { bun -F @cline/code build:runtime }
    Invoke-Checked { bun -F @cline/code build:web }
    New-Item -ItemType Directory -Path "$app/src-tauri/bin/defaults" -Force | Out-Null
    Copy-Item -LiteralPath "$root/fork/defaults/freellm.json" -Destination "$app/src-tauri/bin/defaults/freellm.json"
    Invoke-Checked { python fork/check-bundle-paths.py }
    Invoke-Checked { cargo fetch --locked --manifest-path "$app/src-tauri/Cargo.toml" }
    Invoke-Checked { python fork/collect-licenses.py }
    Push-Location $app
    try { Invoke-Checked { bun tauri build --bundles nsis -- --locked } } finally { Pop-Location }
} finally { Pop-Location }
