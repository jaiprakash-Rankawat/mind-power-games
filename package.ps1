# Builds a clean, uploadable ZIP of the extension.
#
#   Right-click > Run with PowerShell, or:   .\package.ps1
#
# You do NOT need this to test locally - "Load unpacked" takes the folder as it is.
# Use this when you want to share the extension or upload it to the Chrome Web Store,
# which requires a ZIP with manifest.json at the top level.

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

# Only what the extension actually needs at runtime.
$ship = @('manifest.json', 'popup.html', 'game.html', 'profile.html', 'test.html', 'css', 'js', 'icons')

Write-Host ''
Write-Host 'Mind Power Games - packaging' -ForegroundColor Cyan
Write-Host ('-' * 46)

# 1. Pre-flight: refuse to package something Chrome would reject.
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) {
  & node (Join-Path $root 'tools\validate.mjs')
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'Packaging stopped: fix the problems above first.' -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host 'Node not found - skipping pre-flight checks.' -ForegroundColor Yellow
}

# 2. Read the version straight from the manifest so the filename always matches.
$manifest = Get-Content (Join-Path $root 'manifest.json') -Raw | ConvertFrom-Json
$version = $manifest.version

# 3. Stage only the shipping files, so dev files never reach the ZIP.
$stage = Join-Path ([System.IO.Path]::GetTempPath()) ('mpg-build-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $stage | Out-Null
foreach ($item in $ship) {
  $src = Join-Path $root $item
  if (-not (Test-Path $src)) { throw "Missing required item: $item" }
  Copy-Item $src -Destination $stage -Recurse
}

# 4. Zip it with manifest.json at the root of the archive.
$distDir = Join-Path $root 'dist'
if (-not (Test-Path $distDir)) { New-Item -ItemType Directory -Path $distDir | Out-Null }
$zip = Join-Path $distDir ("mind-power-games-v$version.zip")
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip
Remove-Item $stage -Recurse -Force

# A signpost, because "dist" is the folder people accidentally pick in Chrome.
$note = @"
This folder is NOT the extension.

It holds the packaged ZIP, for sharing or the Chrome Web Store only.
Chrome cannot load this folder - there is no manifest.json here.

To load the extension in Chrome:
  chrome://extensions  >  Developer mode ON  >  Load unpacked
  and select the PARENT folder instead:

  $root
"@
Set-Content -Path (Join-Path $distDir 'READ-ME-dist-is-not-the-extension.txt') -Value $note -Encoding utf8

$sizeKb = [Math]::Round((Get-Item $zip).Length / 1KB, 1)
Write-Host ''
Write-Host "Packaged v$version  ->  $zip  ($sizeKb KB)" -ForegroundColor Green
Write-Host 'Upload that ZIP at https://chrome.google.com/webstore/devconsole'
Write-Host ''
