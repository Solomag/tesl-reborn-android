param([string]$Output = 'E:\TESL-build\resource-diag', [string]$Serial)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Adb-Helpers.ps1')
Initialize-DeviceAdb -Serial $Serial
$destination = [IO.Path]::GetFullPath($Output)
$null = New-Item -ItemType Directory -Force -Path $destination
foreach ($name in @('tesl-reborn-language.json','tesl-reborn-language-state.json',
    'tesl-reborn-update-status.json','tesl-reborn-setup.json','tesl-reborn-handoff.json',
    'tesl-reborn-ui-status.json','tesl-reborn-update-notice.json','tesl-reborn-resource-status.json')) {
    $remote = "$script:RemoteRoot/$name"
    $text = (Invoke-DeviceAdb -CommandArgs @('shell', "if [ -f '$remote' ]; then cat '$remote'; else echo '{}'; fi") | Out-String)
    [IO.File]::WriteAllText((Join-Path $destination $name), $text, (New-Object Text.UTF8Encoding($false)))
}
$log = Invoke-DeviceAdb -CommandArgs @('logcat','-d','-t','12000','-v','threadtime',
    'tesl-hook:I','Unity:W','AndroidRuntime:E','ActivityManager:I','ActivityTaskManager:I','*:S') | Out-String
# Hook request bodies already mask secrets; also redact quoted secret fields
# should another selected Android logger include JSON in an exception.
$log = [regex]::Replace($log, '(?i)("(?:password|encryptedAppTicket|token|sessionToken|access_token|refresh_token|authorization)"\s*:\s*")(?:[^"\\]|\\.)*"', '$1[REDACTED]"')
[IO.File]::WriteAllText((Join-Path $destination 'resources.log'), $log, (New-Object Text.UTF8Encoding($false)))
$memory = Invoke-DeviceAdb -CommandArgs @('shell','dumpsys','meminfo','com.bethsoft.theelderscrollslegends') | Out-String
[IO.File]::WriteAllText((Join-Path $destination 'memory.txt'), $memory, (New-Object Text.UTF8Encoding($false)))
Write-Host "Saved diagnostics: $destination"
Write-Host 'Run while loading is stuck, before restarting; or immediately after opening the shop. Login files and game assets are not collected.'
