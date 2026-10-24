param([string]$FeedUrl, [switch]$SafeMode, [switch]$Disable, [switch]$AllowLocalUpdates, [string]$Serial)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Adb-Helpers.ps1')
if ($FeedUrl) {
    $uri = [Uri]$FeedUrl
    if (-not $uri.IsAbsoluteUri -or $uri.Scheme -ne 'https' -or $uri.UserInfo -or $uri.Query -or $uri.Fragment) {
        throw 'Use a trusted public HTTPS manifest URL without credentials/query/fragment'
    }
}
Initialize-DeviceAdb -Serial $Serial
$config = Read-UpdaterConfig
if ($FeedUrl) { $config | Add-Member -NotePropertyName 'feedUrl' -NotePropertyValue $FeedUrl -Force }
$config | Add-Member -NotePropertyName 'safeMode' -NotePropertyValue ([bool]$SafeMode) -Force
$config | Add-Member -NotePropertyName 'enabled' -NotePropertyValue (-not [bool]$Disable) -Force
$config | Add-Member -NotePropertyName 'allowLocalUpdates' -NotePropertyValue ([bool]$AllowLocalUpdates) -Force
Write-UpdaterConfig -Config $config
Write-Host 'CONFIG_SAVED. Fully close and reopen the game for the settings to apply.'
