<#
.SYNOPSIS
  Fetches the current Stable and Test Builders and builds a fresh "APK only"
  with each.

.DESCRIPTION
  For every channel: asks GitHub for the builder-<channel> release, downloads
  TESL-Reborn-Builder-<Channel>.exe when the one in -Folder differs (checked
  by SHA-256), then runs it without its window:
      TESL-Reborn-Builder-<Channel>.exe --build --format apk ...
  The APKs land in -Output, one build folder each, named after the Builder
  (TESL-Reborn-Test-2.231.apk). Game data is not rebuilt.

  Copy this script next to your Builders and the original XAPK and run it:
      powershell -ExecutionPolicy Bypass -File fresh-apk.ps1
      powershell -ExecutionPolicy Bypass -File fresh-apk.ps1 -Channels test

  With -OnlyNew a channel is built only when its Builder changed since the
  last APK this script made (<Output>\fresh-apk-state.json). -Register adds
  a Windows scheduled task for this user that runs it that way every hour
  and at logon, without a window; -Unregister removes it. Every run appends
  its outcome to <Output>\fresh-apk.log.

.PARAMETER Folder
  Where the Builders live; the script's own folder by default.
.PARAMETER Xapk
  The original game XAPK; <Folder>\original.xapk by default.
.PARAMETER Output
  Where the build folders go; <Folder>\output by default.
.PARAMETER Game
  The PC game folder, when the Builder cannot find it by itself.
.PARAMETER Channels
  stable, test or both (the default).
.PARAMETER OnlyNew
  Build a channel only when a new Builder came out.
.PARAMETER Register
  Run this script with -OnlyNew every hour and at logon (Task Scheduler).
.PARAMETER Unregister
  Remove that scheduled task.
#>
param(
    [string]$Folder = $PSScriptRoot,
    [string]$Xapk,
    [string]$Output,
    [string]$Game,
    [ValidateSet("stable", "test")][string[]]$Channels = @("stable", "test"),
    [switch]$OnlyNew,
    [switch]$Register,
    [switch]$Unregister
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # Invoke-WebRequest is much faster without the progress bar.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Repository = "ssorgatem/tesl-reborn-android"
$TaskName = "TESL Reborn fresh APK"

if ($Unregister) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Host "Scheduled task '$TaskName' removed"
    exit 0
}
if ($Register) {
    $script = $PSCommandPath
    $extra = ""
    if ($PSBoundParameters.ContainsKey("Xapk")) { $extra += " -Xapk `"$Xapk`"" }
    if ($PSBoundParameters.ContainsKey("Output")) { $extra += " -Output `"$Output`"" }
    if ($PSBoundParameters.ContainsKey("Game")) { $extra += " -Game `"$Game`"" }
    # -File passes each argument as text: one channel, or both by default.
    if ($Channels.Count -eq 1) { $extra += " -Channels " + $Channels[0] }
    $action = New-ScheduledTaskAction -Execute "powershell.exe" `
        -Argument "-NoProfile -NonInteractive -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$script`" -OnlyNew$extra" `
        -WorkingDirectory $Folder
    $hourly = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Hours 1)
    $logon = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"
    $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -DontStopIfGoingOnBatteries `
        -AllowStartIfOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2)
    $principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" -LogonType Interactive -RunLevel Limited
    Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $hourly, $logon -Settings $settings `
        -Principal $principal -Description "Builds a fresh APK only when a new TESL Reborn Builder comes out ($script)" -Force | Out-Null
    Write-Host "Scheduled task '$TaskName': every hour and at logon, builds only when a Builder changed"
    exit 0
}
# The first Builder build that can build without its window (--build).
$FirstHeadlessBuild = 233
if (-not $Xapk) { $Xapk = Join-Path $Folder "original.xapk" }
if (-not $Output) { $Output = Join-Path $Folder "output" }
if (-not (Test-Path -LiteralPath $Xapk)) { throw "The original XAPK was not found: $Xapk (pass -Xapk)" }
New-Item -ItemType Directory -Force -Path $Output | Out-Null

function Get-Sha256([string]$Path) {
    (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant()
}

function Update-Builder([string]$Channel) {
    $name = "TESL-Reborn-Builder-" + (Get-Culture).TextInfo.ToTitleCase($Channel) + ".exe"
    $release = Invoke-RestMethod -Headers @{ "User-Agent" = "TESL-Reborn-fresh-apk"; "Accept" = "application/vnd.github+json" } `
        -Uri "https://api.github.com/repos/$Repository/releases/tags/builder-$Channel"
    $asset = $release.assets | Where-Object { $_.name -eq $name } | Select-Object -First 1
    if (-not $asset -or $asset.state -ne "uploaded") { throw "${name}: not on the builder-$Channel release right now (being replaced?); try again in a few minutes" }
    if ($asset.digest -notmatch '^sha256:([0-9a-f]{64})$') { throw "${name}: the release gives no SHA-256" }
    $sha = $Matches[1]
    $build = if ($asset.label -match 'build (\d+)') { [int]$Matches[1] } else { 0 }
    $version = if ($asset.label -match 'Builder (\d+\.\d+)') { "Builder " + $Matches[1] } else { "build $build" }
    $path = Join-Path $Folder $name
    if ((Test-Path -LiteralPath $path) -and (Get-Sha256 $path) -eq $sha) {
        Write-Host "[$Channel] $version is already here"
    } else {
        Write-Host "[$Channel] downloading $version ($([math]::Round($asset.size / 1MB)) MB)..."
        $fresh = "$path.download"
        Invoke-WebRequest -UseBasicParsing -Headers @{ "User-Agent" = "TESL-Reborn-fresh-apk" } -Uri $asset.browser_download_url -OutFile $fresh
        if ((Get-Sha256 $fresh) -ne $sha) { Remove-Item -LiteralPath $fresh; throw "${name}: the download does not match its SHA-256" }
        try { Move-Item -Force -LiteralPath $fresh -Destination $path }
        catch { Remove-Item -LiteralPath $fresh -ErrorAction SilentlyContinue; throw "${name}: cannot replace it; close that Builder and run again" }
        Write-Host "[$Channel] $version installed"
    }
    if ($build -lt $FirstHeadlessBuild) { throw "${name}: $version cannot build without its window yet (needs build $FirstHeadlessBuild or later)" }
    return [pscustomobject]@{ Path = $path; Sha = $sha; Version = $version }
}

$StateFile = Join-Path $Output "fresh-apk-state.json"
function Read-State {
    try { return (Get-Content -LiteralPath $StateFile -Raw -Encoding UTF8 | ConvertFrom-Json) } catch { return [pscustomobject]@{} }
}
function Save-State($State) {
    $State | ConvertTo-Json | Set-Content -LiteralPath $StateFile -Encoding UTF8
}

function Invoke-Build([string]$Channel, [string]$Builder) {
    $log = Join-Path $Output "fresh-apk-$Channel.log"
    Remove-Item -LiteralPath $log -ErrorAction SilentlyContinue
    $arguments = @("--build", "--format", "apk", "--xapk", $Xapk, "--output", $Output, "--log", $log)
    if ($Game) { $arguments += @("--game", $Game) }
    $quoted = ($arguments | ForEach-Object { '"' + $_ + '"' }) -join " "
    Write-Host "[$Channel] building the APK..."
    $process = Start-Process -FilePath $Builder -ArgumentList $quoted -PassThru
    $null = $process.Handle  # keeps the exit code readable after it ends
    $shown = 0
    while ($true) {
        $done = $process.HasExited
        if (Test-Path -LiteralPath $log) {
            $lines = @(Get-Content -LiteralPath $log -Encoding UTF8)
            for (; $shown -lt $lines.Count; $shown++) { Write-Host "  $($lines[$shown])" }
        }
        if ($done) { break }
        Start-Sleep -Milliseconds 500
    }
    $last = if (Test-Path -LiteralPath $log) { (Get-Content -LiteralPath $log -Encoding UTF8 | Select-Object -Last 1) } else { "" }
    if ($process.ExitCode -ne 0 -or $last -notmatch '^BUILD_READY: (.+)$') { throw "[$Channel] the build failed: $last (log: $log)" }
    $apk = Get-ChildItem -LiteralPath $Matches[1].Trim() -Filter *.apk | Select-Object -First 1
    return $apk.FullName
}

$results = @()
$state = Read-State
foreach ($channel in $Channels) {
    try {
        $builder = Update-Builder $channel
        $built = $state.PSObject.Properties[$channel]
        if ($OnlyNew -and $built -and $built.Value -eq $builder.Sha) {
            $results += "[$channel] $($builder.Version): APK already built"
            continue
        }
        $results += "[$channel] $($builder.Version): " + (Invoke-Build $channel $builder.Path)
        $state | Add-Member -Force -NotePropertyName $channel -NotePropertyValue $builder.Sha
        Save-State $state
    } catch {
        $results += "[$channel] FAILED: $($_.Exception.Message)"
    }
}
Write-Host ""
$results | ForEach-Object { Write-Host $_ }
$stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
$results | ForEach-Object { "$stamp $_" } | Add-Content -LiteralPath (Join-Path $Output "fresh-apk.log") -Encoding UTF8
if ($results -match "FAILED") { exit 1 }
