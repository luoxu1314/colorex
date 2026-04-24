$ErrorActionPreference = "Stop"

# One-shot: build Python backend (PyInstaller onedir) and Windows NSIS installer
# locally on a Windows machine. Run in a PowerShell from the repo root:
#
#   .\scripts\build-local-win.ps1
#
# Prerequisites (install once):
#   - Node.js 20+ (https://nodejs.org)
#   - Python 3.11 (https://www.python.org/downloads/)
#   - PowerShell 5.1+ (bundled with Windows 10/11)
#
# Output:
#   dist\ColorExchange Setup <version>.exe   <- the installer to hand out
#
# Flags:
#   -SkipBackend   reuse existing dist-python\colorexchange-backend if present
#   -SkipInstall   skip `npm ci` (faster re-builds once node_modules is warm)
#
param(
    [switch]$SkipBackend,
    [switch]$SkipInstall
)

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root
Write-Host "[build-local-win] repo: $Root" -ForegroundColor Cyan

function Assert-Command($name, $hint) {
    $cmd = Get-Command $name -ErrorAction SilentlyContinue
    if (-not $cmd) {
        throw "Missing '$name' on PATH. $hint"
    }
    Write-Host "[build-local-win] found $name -> $($cmd.Source)"
}

Assert-Command node   "Install Node.js 20+ from https://nodejs.org and reopen the shell."
Assert-Command npm    "Install Node.js 20+ from https://nodejs.org and reopen the shell."
Assert-Command python "Install Python 3.11 from https://www.python.org/downloads/ and reopen the shell."

$nodeVersion = (node --version).Trim()
$pyVersion   = (python --version 2>&1).Trim()
Write-Host "[build-local-win] node=$nodeVersion  python=$pyVersion" -ForegroundColor Cyan

if (-not $SkipInstall) {
    if (Test-Path "package-lock.json") {
        Write-Host "[build-local-win] npm ci ..." -ForegroundColor Cyan
        npm ci
    }
    else {
        Write-Host "[build-local-win] npm install ..." -ForegroundColor Cyan
        npm install
    }
}
else {
    Write-Host "[build-local-win] skipping npm install (SkipInstall)" -ForegroundColor Yellow
}

$backendExe = Join-Path "dist-python" "colorexchange-backend\colorexchange-backend.exe"
if ($SkipBackend -and (Test-Path $backendExe)) {
    Write-Host "[build-local-win] reusing existing backend at $backendExe" -ForegroundColor Yellow
}
else {
    Write-Host "[build-local-win] building Python backend via PyInstaller ..." -ForegroundColor Cyan
    & (Join-Path $Root "scripts\build-backend-win.ps1")
    if (-not (Test-Path $backendExe)) {
        throw "Expected backend exe at $backendExe but it was not produced."
    }
}
$backendSize = [math]::Round((Get-Item $backendExe).Length / 1MB, 2)
Write-Host "[build-local-win] backend exe: $backendExe ($backendSize MB)" -ForegroundColor Green

Write-Host "[build-local-win] building renderer + main (vite) ..." -ForegroundColor Cyan
npm run build

Write-Host "[build-local-win] packaging NSIS installer ..." -ForegroundColor Cyan
npx electron-builder --win nsis --x64 --publish never

$installer = Get-ChildItem -Path "dist" -Filter "*.exe" -ErrorAction SilentlyContinue |
    Where-Object { $_.Name -notlike "*unpacked*" } |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1

if (-not $installer) {
    throw "No installer .exe produced under dist\."
}

$sizeMb = [math]::Round($installer.Length / 1MB, 2)
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Installer: $($installer.FullName)"                            -ForegroundColor Green
Write-Host "  Size:      $sizeMb MB"                                        -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
