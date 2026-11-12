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
#>
param(
    [string]$Folder = $PSScriptRoot,
    [string]$Xapk,
    [string]$Output,
    [string]$Game,
    [ValidateSet("stable", "test")][string[]]$Channels = @("stable", "test")
)

$ErrorActionPreference = "Stop"
$ProgressPreference = "SilentlyContinue"  # Invoke-WebRequest is much faster without the progress bar.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Repository = "ssorgatem/tesl-reborn-android"
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
    return $path
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
foreach ($channel in $Channels) {
    try {
        $builder = Update-Builder $channel
        $results += "[$channel] " + (Invoke-Build $channel $builder)
    } catch {
        $results += "[$channel] FAILED: $($_.Exception.Message)"
    }
}
Write-Host ""
$results | ForEach-Object { Write-Host $_ }
if ($results -match "FAILED") { exit 1 }
