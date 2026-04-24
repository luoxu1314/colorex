$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
Set-Location $Root

if (Test-Path ".venv-win") {
  Remove-Item ".venv-win" -Recurse -Force
}

python -m venv .venv-win
& ".\.venv-win\Scripts\python.exe" -m pip install --upgrade pip
& ".\.venv-win\Scripts\python.exe" -m pip install -r python\requirements.txt
& ".\.venv-win\Scripts\python.exe" -m pip install pyinstaller

if (Test-Path "dist-python") {
  Remove-Item "dist-python" -Recurse -Force
}

& ".\.venv-win\Scripts\pyinstaller.exe" `
  --clean `
  --noconfirm `
  --onedir `
  --name colorexchange-backend `
  --distpath dist-python `
  --workpath build-python `
  --specpath build-python `
  --paths python `
  --hidden-import matplotlib.backends.backend_agg `
  --hidden-import PIL._tkinter_finder `
  --exclude-module tkinter `
  --exclude-module IPython `
  --exclude-module notebook `
  python\process.py

$bundledExe = Join-Path "dist-python" "colorexchange-backend\colorexchange-backend.exe"
if (!(Test-Path $bundledExe)) {
  throw "Backend exe was not produced at $bundledExe."
}

Write-Host "Windows backend built (onedir): $bundledExe"
