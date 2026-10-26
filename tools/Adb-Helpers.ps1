function Initialize-DeviceAdb {
    param([string]$Serial)
    $null = Get-Command adb -ErrorAction Stop
    $script:DeviceArgs = @()
    if ($Serial) { $script:DeviceArgs = @('-s', $Serial) }
    $null = Invoke-DeviceAdb -CommandArgs @('get-state')
    $userId = (Invoke-DeviceAdb -CommandArgs @('shell', 'am', 'get-current-user') | Out-String).Trim()
    if ($userId -notmatch '^\d+$') { throw 'Could not determine Android user' }
    $script:RemoteRoot = "/storage/emulated/$userId/Android/data/com.bethsoft.theelderscrollslegends/files"
}

function Invoke-DeviceAdb {
    param([string[]]$CommandArgs)
    $adbArgs = $script:DeviceArgs
    & adb @adbArgs @CommandArgs
    if ($LASTEXITCODE -ne 0) { throw "adb failed: $($CommandArgs -join ' ')" }
}

function Read-UpdaterConfig {
    $remote = "$script:RemoteRoot/tesl-reborn-updater.json"
    $text = (Invoke-DeviceAdb -CommandArgs @('shell', "if [ -f '$remote' ]; then cat '$remote'; else echo '{}'; fi") | Out-String).Trim()
    return ($text | ConvertFrom-Json -ErrorAction Stop)
}

function Write-UpdaterConfig {
    param($Config)
    $temp = [IO.Path]::GetTempFileName()
    try {
        [IO.File]::WriteAllText($temp, ($Config | ConvertTo-Json -Depth 8), (New-Object Text.UTF8Encoding($false)))
        Invoke-DeviceAdb -CommandArgs @('shell', "mkdir -p '$script:RemoteRoot'")
        Invoke-DeviceAdb -CommandArgs @('push', $temp, "$script:RemoteRoot/tesl-reborn-updater.json.new")
        Invoke-DeviceAdb -CommandArgs @('shell', "mv '$script:RemoteRoot/tesl-reborn-updater.json.new' '$script:RemoteRoot/tesl-reborn-updater.json'")
    } finally { Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue }
}
