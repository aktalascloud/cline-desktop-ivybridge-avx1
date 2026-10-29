param([ValidateSet('minimal','full')][string]$Mode='minimal',[string]$BaselineSha)
$ErrorActionPreference='Stop'
$root=Split-Path -Parent $PSScriptRoot
$app=Join-Path $root 'apps/examples/desktop-app'
if(-not $BaselineSha){$BaselineSha=(Get-Content "$PSScriptRoot/components.json" -Raw|ConvertFrom-Json).build_source_sha}
if($BaselineSha -notmatch '^[0-9a-f]{40}$'){throw 'A verified baseline SHA is required'}
$changed=@(git -C $root diff --name-only $BaselineSha --)
if($LASTEXITCODE){throw 'Cannot compare validation inputs'}
$timings=[Collections.Generic.List[object]]::new()
function Invoke-Check([string]$label,[string]$directory,[string[]]$commandArgs){
 $watch=[Diagnostics.Stopwatch]::StartNew()
 Push-Location $directory
 try{& bun @commandArgs;if($LASTEXITCODE){throw "$label failed"}}finally{Pop-Location;$watch.Stop()}
 $timings.Add([ordered]@{check=$label;seconds=[Math]::Round($watch.Elapsed.TotalSeconds,3)})
}
function Changed-Tests([string]$prefix){
 @($changed|Where-Object {$_ -like "$prefix/*" -and $_ -match '\.test\.tsx?$' -and $_ -notmatch '(live|integration|e2e)\.test\.'}|ForEach-Object {$_.Substring($prefix.Length+1)})
}
Invoke-Check 'Desktop typecheck' $root @('-F','@cline/code','typecheck')
if(@($changed|Where-Object {$_ -like 'sdk/*'}).Count){
 foreach($package in @('shared','llms','core')){Invoke-Check "$package typecheck" $root @('-F',"@cline/$package",'typecheck')}
}
Invoke-Check 'CLI compatibility typecheck' $root @('-F','@cline/cli','typecheck')
if(@($changed|Where-Object {$_ -like 'sdk/packages/agents/*'}).Count){
 Invoke-Check 'Agent runtime typecheck' $root @('-F','@cline/agents','typecheck')
 $agentTests=@('src/agent-runtime.test.ts')+@(Changed-Tests 'sdk/packages/agents')
 Invoke-Check 'Agent loop and completion regressions' "$root/sdk/packages/agents" (@('x','vitest','run','--maxWorkers=2','--config','vitest.config.ts')+@($agentTests|Sort-Object -Unique))
}
Invoke-Check 'Distribution profile bootstrap' "$root/apps/cli" @('test','script/distribution-bootstrap.test.ts')
$cliTests=@('src/runtime/run-agent.test.ts','src/commands/update.test.ts')+@(Changed-Tests 'apps/cli')
if($Mode -eq 'full'){$cliTests=@('src/runtime','src/commands','src/utils/hooks.test.ts')}
Invoke-Check 'CLI affected regressions' "$root/apps/cli" (@('x','vitest','run','--maxWorkers=2','--config','vitest.config.ts')+@($cliTests|Sort-Object -Unique))
$coreTests=@('src/extensions/mcp','src/services/providers/local-provider-service.test.ts')+@(Changed-Tests 'sdk/packages/core')
if(@($changed|Where-Object {$_ -like 'sdk/packages/core/src/hub/*' -or $_ -like 'sdk/packages/core/src/runtime/*'}).Count){
 $coreTests+=@('src/hub/server/boundary.test.ts','src/runtime/host/local-runtime-host.test.ts','src/runtime/orchestration/session-runtime-orchestrator.test.ts')
}
if(@($changed|Where-Object {$_ -like 'sdk/packages/core/src/hooks/*'}).Count){$coreTests+='src/hooks/hook-file-hooks.test.ts'}
if($Mode -eq 'full'){$coreTests=@('src')}
Invoke-Check 'Core affected/security regressions' "$root/sdk/packages/core" (@('x','vitest','run','--maxWorkers=2','--config','vitest.config.ts')+@($coreTests|Sort-Object -Unique))
if(@($changed|Where-Object {$_ -in @('sdk/packages/core/src/hub/daemon/resume-from-store.e2e.test.ts','sdk/packages/core/src/hub/runtime-host/hub-runtime-host.ts','apps/examples/desktop-app/sidecar/chat-session.ts')}).Count){
 Invoke-Check 'Stored history over real Bun wire' "$root/sdk/packages/core" @('x','vitest','run','--maxWorkers=1','--config','vitest.e2e.config.ts','src/hub/daemon/resume-from-store.e2e.test.ts')
}
if(@($changed|Where-Object {$_ -like 'sdk/packages/shared/*'}).Count){
 $sharedTests=@('src/parse/shell.test.ts','src/parse/shell.invocation.test.ts')+@(Changed-Tests 'sdk/packages/shared')
 Invoke-Check 'Shared affected regressions' "$root/sdk/packages/shared" (@('x','vitest','run','--maxWorkers=2','--config','vitest.config.ts')+@($sharedTests|Sort-Object -Unique))
}
if(@($changed|Where-Object {$_ -like 'sdk/packages/llms/*'}).Count){
 $llmsTests=@('src/providers/builtins.test.ts','src/providers/model-capabilities.test.ts','src/providers/ai-sdk-reasoning.test.ts','src/providers/ai-sdk.tool-calls.test.ts','src/transcription.test.ts')+@(Changed-Tests 'sdk/packages/llms')
 if('sdk/packages/llms/package.json' -in $changed){$llmsTests+=@('src/services/langfuse-telemetry.test.ts','src/services/langfuse-telemetry.integration.test.ts')}
 Invoke-Check 'Provider/catalog compatibility' "$root/sdk/packages/llms" (@('x','vitest','run','--maxWorkers=2','--config','vitest.config.ts')+@($llmsTests|Sort-Object -Unique))
}
# These two suites have real timers and a large module graph; isolate them.
Invoke-Check 'Desktop session runtime' $app @('x','vitest','run','--maxWorkers=1','--config','vitest.config.ts','sidecar/chat-session.test.ts')
Invoke-Check 'Desktop composer' $app @('x','vitest','run','--maxWorkers=1','--config','vitest.config.ts','webview/components/views/chat/chat-input-bar.test.tsx')
$desktopTests=@('webview/lib/changelog.test.ts','webview/lib/i18n.test.ts','webview/lib/provider-model-catalog.test.ts','sidecar/update-safety.test.ts','sidecar/commands-settings.test.ts')+@(Changed-Tests 'apps/examples/desktop-app')
$desktopTests=@($desktopTests|Where-Object {$_ -notin @('sidecar/chat-session.test.ts','webview/components/views/chat/chat-input-bar.test.tsx') -and (Test-Path -LiteralPath (Join-Path $app $_))}|Sort-Object -Unique)
if($Mode -eq 'full'){
 Invoke-Check 'Desktop full regressions' $app @('x','vitest','run','--maxWorkers=2','--config','vitest.config.ts','--exclude','sidecar/chat-session.test.ts','--exclude','webview/components/views/chat/chat-input-bar.test.tsx')
}else{
 Invoke-Check 'Desktop affected regressions' $app (@('x','vitest','run','--maxWorkers=2','--config','vitest.config.ts')+$desktopTests)
}
$output=Join-Path $root 'dist/avx1';New-Item -ItemType Directory -Path $output -Force|Out-Null
[ordered]@{mode=$Mode;baseline_sha=$BaselineSha;changed_files=$changed.Count;desktop_test_files=$desktopTests;checks=$timings}|ConvertTo-Json -Depth 8|Set-Content "$output/validation.json" -Encoding utf8
