# Builds the native Android APK and copies it to mobile2\dist.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\build-apk.ps1 [-Variant release|debug]
param(
    [ValidateSet('release', 'debug')]
    [string]$Variant = 'release'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
if (-not $env:JAVA_HOME) { $env:JAVA_HOME = 'C:\Program Files\Android\Android Studio\jbr' }

Push-Location $root
try {
    $task = if ($Variant -eq 'release') { 'assembleRelease' } else { 'assembleDebug' }
    .\gradlew.bat $task
    if ($LASTEXITCODE -ne 0) { throw "gradle $task failed" }
} finally {
    Pop-Location
}

$apk = Join-Path $root "app\build\outputs\apk\$Variant\app-$Variant.apk"
$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$out = Join-Path $dist "pusoy13-$Variant.apk"
Copy-Item $apk $out -Force
Write-Host "APK: $out"
