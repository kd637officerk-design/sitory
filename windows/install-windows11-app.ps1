<#
.SYNOPSIS
  Creates a Windows 11 Desktop & Start Menu app shortcut for Bill World using public\app-icon.ico
  and opens it as a standalone Windows 11 app window in Microsoft Edge.
#>
param(
  [string]$AppUrl = "http://localhost:3000"
)

$ErrorActionPreference = "Stop"
$RepoRoot = Split-Path -Parent $PSScriptRoot
$IconPath = Join-Path $RepoRoot "public\app-icon.ico"

$EdgeCandidates = @(
  "$env:ProgramFiles(x86)\Microsoft\Edge\Application\msedge.exe",
  "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
  "$env:LocalAppData\Microsoft\Edge\Application\msedge.exe"
)
$EdgeExe = $EdgeCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $EdgeExe) {
  Write-Host "Microsoft Edge was not found. Opening $AppUrl in your default browser."
  Start-Process $AppUrl
  exit 0
}

$WshShell = New-Object -ComObject WScript.Shell
$DesktopDir = [Environment]::GetFolderPath("Desktop")
$StartMenuDir = Join-Path ([Environment]::GetFolderPath("Programs")) "Bill World"
if (-not (Test-Path $StartMenuDir)) {
  New-Item -ItemType Directory -Path $StartMenuDir | Out-Null
}

foreach ($TargetDir in @($DesktopDir, $StartMenuDir)) {
  $ShortcutPath = Join-Path $TargetDir "Bill World.lnk"
  $Shortcut = $WshShell.CreateShortcut($ShortcutPath)
  $Shortcut.TargetPath = $EdgeExe
  $Shortcut.Arguments = "--app=$AppUrl"
  $Shortcut.WorkingDirectory = $RepoRoot
  if (Test-Path $IconPath) {
    $Shortcut.IconLocation = "$IconPath,0"
  }
  $Shortcut.Description = "Bill World — Windows 11 Main Photos Opener & Gallery"
  $Shortcut.Save()
}

Write-Host "Created Windows 11 Desktop & Start Menu shortcuts for Bill World."
Write-Host "Launching Bill World..."
Start-Process $EdgeExe -ArgumentList "--app=$AppUrl"
