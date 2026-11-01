param(
 [string]$SourceSha,
 [string]$SigningKeyFile,
 [ValidateSet('minimal','full')][string]$Checks='minimal'
)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
if(-not $SourceSha){$SourceSha=(git -C $root rev-parse HEAD).Trim()}
if($SourceSha -notmatch '^[0-9a-f]{40}$'){throw 'Use a full source SHA'}
if(git -C $root status --porcelain --untracked-files=no){throw 'Commit or restore tracked changes before building'}
if(-not $env:VCToolsInstallDir){
 $vswhere=Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio/Installer/vswhere.exe'
 if(-not (Test-Path -LiteralPath $vswhere)){throw 'Install Visual Studio Build Tools with MSVC 14.44.35207 and Windows SDK 10.0.26100.0'}
 $vs=& $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
 if(-not $vs){throw 'MSVC Build Tools not found'}
 Import-Module "$vs/Common7/Tools/Microsoft.VisualStudio.DevShell.dll"
 Enter-VsDevShell -VsInstallPath $vs -SkipAutomaticLocation -DevCmdArguments '-arch=x64 -host_arch=x64 -vcvars_ver=14.44.35207 -winsdk=10.0.26100.0'
}
if($SigningKeyFile){
 $env:TAURI_SIGNING_PRIVATE_KEY=(Get-Content -LiteralPath $SigningKeyFile -Raw).Trim()
}
if(-not $env:TAURI_SIGNING_PRIVATE_KEY){throw 'Supply the existing fork updater key with -SigningKeyFile or TAURI_SIGNING_PRIVATE_KEY'}
try {
 & "$PSScriptRoot/build-windows.ps1" -SourceSha $SourceSha -Profile ivy-fat1 -Checks $Checks
} finally {
 if($SigningKeyFile){Remove-Item Env:TAURI_SIGNING_PRIVATE_KEY -ErrorAction SilentlyContinue}
}
