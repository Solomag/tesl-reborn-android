param([string]$Output = '.', [string]$Serial)
$ErrorActionPreference = 'Stop'
. (Join-Path $PSScriptRoot 'Adb-Helpers.ps1')
Initialize-DeviceAdb -Serial $Serial
$destination = [IO.Path]::GetFullPath($Output)
$null = New-Item -ItemType Directory -Force -Path $destination
$steps = @(
    @('gear', 'Open the gear menu BEFORE Settings, then press Enter here'),
    @('settings', 'Open the real in-game Settings window, then press Enter here'),
    @('english', 'Change the game to English, wait for it to load, open Settings, then press Enter here')
)
foreach ($step in $steps) {
    $null = Read-Host $step[1]
    $label = $step[0]
    $id = [guid]::NewGuid().ToString('N')
    $temp = [IO.Path]::GetTempFileName()
    $result = Join-Path $destination "tesl-reborn-settings-$label.json"
    try {
        $request = @{id = $id; label = $label} | ConvertTo-Json -Compress
        [IO.File]::WriteAllText($temp, $request, (New-Object Text.UTF8Encoding($false)))
        $null = Invoke-DeviceAdb -CommandArgs @('push', $temp, "$script:RemoteRoot/tesl-reborn-inspect-request.json.new")
        $null = Invoke-DeviceAdb -CommandArgs @('shell', "mv '$script:RemoteRoot/tesl-reborn-inspect-request.json.new' '$script:RemoteRoot/tesl-reborn-inspect-request.json'")
        $received = $false
        for ($attempt = 0; $attempt -lt 20; $attempt++) {
            Start-Sleep -Milliseconds 700
            $remote = "$script:RemoteRoot/tesl-reborn-settings-report-$label.json"
            $text = (Invoke-DeviceAdb -CommandArgs @('shell', "if [ -f '$remote' ]; then cat '$remote'; else echo '{}'; fi") | Out-String).Trim()
            $data = $text | ConvertFrom-Json
            if ($data.requestId -eq $id) {
                [IO.File]::WriteAllText($result, $text, (New-Object Text.UTF8Encoding($false)))
                Write-Host "Saved: $result"
                $received = $true
                break
            }
        }
        if (-not $received) { throw 'No report received. Install diagnostic APK 31 and keep the game in the foreground.' }
    } finally { Remove-Item -LiteralPath $temp -Force -ErrorAction SilentlyContinue }
}
Write-Host 'Done. Send the three tesl-reborn-settings-*.json files. The collector does not read login files or capture HTTP traffic.'
