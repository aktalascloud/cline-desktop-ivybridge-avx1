param(
 [Parameter(Mandatory)][ValidatePattern('^[0-9a-f]{40}$')][string]$SourceSha,
 [Parameter(Mandatory)][string]$CompiledReceipt
)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$app=Join-Path $root 'apps/examples/desktop-app'
$receipt=Get-Content -LiteralPath $CompiledReceipt -Raw|ConvertFrom-Json
if((git -C $root rev-parse HEAD).Trim() -ne $SourceSha){throw 'Source SHA mismatch'}
if(@(git -C $root status --porcelain --untracked-files=normal).Count){throw 'Public source checkout must be clean'}
if($receipt.source_sha -ne '4f541be3afb1609f765e413ff90bc6458b05173a' -or $receipt.ci_run -ne 40830543121 -or $receipt.ci_status -ne 'success'){throw 'Unknown compiled baseline'}
$allowed=@('fork/rebundle-managed-resources.ps1','.github/workflows/qualify-installer-gateway.yml','fork/dsw2api/gateway/browser_session_lease.py','fork/dsw2api/gateway/server.py','fork/dsw2api/gateway/managed_runner.py','fork/dsw2api/test-browser-lease.py','fork/dsw2api/test-managed.py','fork/browser-bridge/extension-status.test.mjs','fork/browser-bridge/shared-extension.test.mjs','README.md','README.ru.md','fork/components.json','fork/qualification.json','fork/review-ledger.json')
$changed=@(git -C $root diff --name-only $receipt.source_sha HEAD)
if($LASTEXITCODE){throw 'Cannot compare baseline'}
foreach($path in $changed){
 if($path -notin $allowed -and $path -notmatch '^fork/browser-bridge/extension/[a-zA-Z0-9_./-]+\.(js|json|html|png|txt)$'){throw "Compiled or unreviewed input changed: $path"}
}
$configuration=Get-Content "$app/src-tauri/tauri.conf.json" -Raw|ConvertFrom-Json
if($configuration.version -ne $receipt.version){throw 'Embedded version changed; full build required'}
function Check-Compiled {
 $actual=@(foreach($directory in @("$app/webview/out","$app/src-tauri/bin")){
  foreach($file in Get-ChildItem -LiteralPath $directory -Recurse -File){
   $relative=$file.FullName.Substring($root.Length+1).Replace('\','/')
   if($relative -like '*/bin/dsw2api/*' -or $relative -like '*/bin/browser-bridge/extension/*' -or $relative -like '*/bin/browser-bridge/files.json'){continue}
   $relative
  }
 })
 if(@(Compare-Object @($receipt.files.PSObject.Properties.Name|Sort-Object) @($actual|Sort-Object)).Count){throw 'Compiled artifact inventory changed'}
 foreach($item in $receipt.files.PSObject.Properties){
  $path=Join-Path $root $item.Name
  if((Get-Item -LiteralPath $path).Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Compiled artifact is a link'}
  if((Get-FileHash -LiteralPath $path -Algorithm SHA256).Hash.ToLowerInvariant() -ne $item.Value){throw "Compiled artifact changed: $($item.Name)"}
 }
}
Check-Compiled
python "$PSScriptRoot/prepare-dsw2api.py"
if($LASTEXITCODE){throw 'Managed resources failed'}
python "$PSScriptRoot/dsw2api/test-browser-lease.py"
if($LASTEXITCODE){throw 'Cross-process lease regression failed'}
& "$app/src-tauri/bin/dsw2api/runtime/python.exe" -I -B -X utf8 "$PSScriptRoot/dsw2api/test-managed.py" "$app/src-tauri/bin/dsw2api"
if($LASTEXITCODE){throw 'Managed HTTP/SSE/auth/cancellation regression failed'}
node --test "$PSScriptRoot/browser-bridge/extension-status.test.mjs" "$PSScriptRoot/browser-bridge/shared-extension.test.mjs"
if($LASTEXITCODE){throw 'Shared connector regressions failed'}
# Only extension assets change. The existing audited native host is retained.
$bridge=Join-Path $app 'src-tauri/bin/browser-bridge'
Copy-Item -Path "$PSScriptRoot/browser-bridge/extension/*" -Destination "$bridge/extension" -Recurse -Force
$inventory=Get-Content "$bridge/files.json" -Raw|ConvertFrom-Json
$files=[ordered]@{}
Get-ChildItem -LiteralPath $bridge -File -Recurse|Where-Object {$_.FullName -ne "$bridge/files.json" -and $_.Name -ne 'files.json'}|ForEach-Object {
 if($_.Attributes -band [IO.FileAttributes]::ReparsePoint){throw 'Bridge asset is a link'}
 $files[$_.FullName.Substring($bridge.Length+1).Replace('\','/')]=(Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant()
}
$inventory.files=$files
$inventory|ConvertTo-Json -Depth 8|Set-Content "$bridge/files.json" -Encoding utf8
Check-Compiled
$target=if($env:CARGO_TARGET_DIR){$env:CARGO_TARGET_DIR}else{"$app/src-tauri/target"}
$native=Join-Path $target 'release/cline-app.exe'
if((Get-FileHash -LiteralPath $receipt.native_payload -Algorithm SHA256).Hash.ToLowerInvariant() -ne $receipt.native_sha256){throw 'Audited native payload changed'}
if((Get-FileHash -LiteralPath $native -Algorithm SHA256).Hash.ToLowerInvariant() -notin @($receipt.raw_native_sha256,$receipt.native_sha256)){throw 'Native build output changed'}
Copy-Item -LiteralPath $receipt.native_payload -Destination $native -Force
Push-Location $app
try {
 bun tauri bundle --bundles nsis --config src-tauri/tauri.prepared.conf.json --no-binary-patching --verbose
 if($LASTEXITCODE){throw 'NSIS rebundle failed'}
}finally{Pop-Location}
Check-Compiled
if((Get-FileHash -LiteralPath $native -Algorithm SHA256).Hash.ToLowerInvariant() -ne $receipt.native_sha256){throw 'Bundler changed compiled native payload'}
$installer=Join-Path $target "release/bundle/nsis/Cline Desktop AVX1 RU_$($configuration.version)_x64-setup.exe"
$output=Join-Path $root 'dist/avx1';$exe=Join-Path $output 'Cline-Desktop-AVX1-RU-Setup.exe'
Copy-Item -LiteralPath $installer -Destination $exe -Force
& "$root/.build-cache/updater-verifier/release/cline-updater-verify.exe" $exe "$PSScriptRoot/updater/public-key.txt" ($installer+'.sig')
if($LASTEXITCODE){throw 'Updater signature/tamper check failed'}
[ordered]@{source_sha=$SourceSha;profile='ivy-fat1';sha256=(Get-FileHash $exe -Algorithm SHA256).Hash.ToLowerInvariant();size=(Get-Item $exe).Length;lto='fat';codegen_units='1';compiled_source_sha=$receipt.source_sha;compiled_ci_run=$receipt.ci_run;compiled_files_verified=@($receipt.files.PSObject.Properties.Name).Count;native_sha256=$receipt.native_sha256;compiled_inputs_reused=$true}|ConvertTo-Json|Set-Content "$output/manifest.json" -Encoding utf8
