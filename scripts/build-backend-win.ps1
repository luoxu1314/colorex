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
  --onefile `
  --name colorexchange-backend `
  --distpath dist-python `
  --workpath build-python `
  --specpath build-python `
  --paths python `
  --hidden-import matplotlib.backends.backend_agg `
  --hidden-import PIL._tkinter_finder `
  python\process.py

if (!(Test-Path "dist-python\colorexchange-backend.exe")) {
  throw "Backend exe was not produced."
}

Write-Host "Windows backend built: dist-python\colorexchange-backend.exe"
