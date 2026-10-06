# Builds the Android release APK on Windows.
# Why: React Native's native build fails on Windows when the folder path is long (260-character limit). This script maps
# the mobile folder to a short drive letter (no admin rights needed), builds from there, and removes the mapping.
# Usage:  powershell -ExecutionPolicy Bypass -File scripts\build-android-windows.ps1 [-Arch arm64-v8a,armeabi-v7a] [-Version 0.1.0] [-Code 100]
param(
  [string]$Arch = "arm64-v8a,armeabi-v7a",
  [string]$Version = "0.1.0",
  [int]$Code = 100,
  [string]$Drive = "L:"
)
$ErrorActionPreference = "Stop"
$real = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
cmd /c "subst $Drive /D" 2>$null | Out-Null
cmd /c "subst $Drive `"$real`""
try {
  $env:LT_REAL_ROOT = $real
  $env:LT_SHORT_ROOT = "$Drive\"
  if (-not $env:JAVA_HOME) { throw "Set JAVA_HOME to a JDK 17 folder first." }
  Set-Content -Path "$real\android\local.properties" -Value ("sdk.dir=" + $env:ANDROID_HOME.Replace('\', '/'))
  Push-Location "$Drive\android"
  & .\gradlew.bat assembleRelease "-PreactNativeArchitectures=$Arch" "-PappVersionName=$Version" "-PappVersionCode=$Code"
  if ($LASTEXITCODE -ne 0) { throw "Gradle failed with exit code $LASTEXITCODE" }
  Pop-Location
  Write-Host "APK: $real\android\app\build\outputs\apk\release\app-release.apk"
} finally {
  Remove-Item Env:\LT_REAL_ROOT -ErrorAction SilentlyContinue
  cmd /c "subst $Drive /D" 2>$null | Out-Null
}
