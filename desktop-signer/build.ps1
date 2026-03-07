# Build PDFSignPro Signer as a onefile PyInstaller executable
# Requires: pip install pyinstaller

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

# Ensure PyInstaller is installed
python -c "import PyInstaller" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "PyInstaller not found. Install with: pip install pyinstaller" -ForegroundColor Yellow
    exit 1
}

# Ensure assets/fonts exists and contains font (font may be in .gitignore)
$AssetsFonts = Join-Path (Join-Path $ScriptDir "assets") "fonts"
if (-not (Test-Path $AssetsFonts)) {
    New-Item -ItemType Directory -Path $AssetsFonts -Force | Out-Null
}
$FontFile = Join-Path $AssetsFonts "NotoSans-Regular.ttf"
if (-not (Test-Path $FontFile)) {
    Write-Host "Font not found: $FontFile" -ForegroundColor Red
    Write-Host "Download from: https://github.com/openmaptiles/fonts/raw/master/noto-sans/NotoSans-Regular.ttf" -ForegroundColor Yellow
    Write-Host "Save to: assets/fonts/NotoSans-Regular.ttf" -ForegroundColor Yellow
    exit 1
}

# Collect all files in assets/fonts for --add-data (PyInstaller: src;dest)
# Use absolute path for src so PyInstaller finds files correctly (avoids build/ resolution)
$AddDataArgs = @()
if (Test-Path $AssetsFonts) {
    Get-ChildItem -Path $AssetsFonts -File | ForEach-Object {
        $srcPath = $_.FullName.Replace("\", "/")
        $AddDataArgs += "--add-data", "${srcPath};assets/fonts"
    }
}

# Clean previous build
if (Test-Path "dist") { Remove-Item -Recurse -Force dist }
if (Test-Path "build") { Remove-Item -Recurse -Force build }

# Build (include pkcs11 submodules for PKCS#11 / USB token support)
# GUI app: --noconsole, PySide6, entry point gui_main.py
$PyInstallerArgs = @(
    "--onefile",
    "--noconsole",
    "--name", "PDFSignProSigner",
    "--distpath", "dist",
    "--specpath", "build",
    "--workpath", "build",
    "--clean",
    "--collect-submodules", "pkcs11",
    "--hidden-import", "pkcs11.attributes",
    "--hidden-import", "requests",
    "--hidden-import", "PySide6.QtCore",
    "--hidden-import", "PySide6.QtGui",
    "--hidden-import", "PySide6.QtWidgets",
    "gui_main.py"
) + $AddDataArgs

Write-Host "Running PyInstaller..."
python -m PyInstaller @PyInstallerArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed." -ForegroundColor Red
    exit 1
}

$ExePath = Join-Path (Join-Path $ScriptDir "dist") "PDFSignProSigner.exe"
if (Test-Path $ExePath) {
    $FullPath = (Resolve-Path $ExePath).Path
    Write-Host ""
    Write-Host "Build complete. Executable generated at:" -ForegroundColor Green
    Write-Host "  $FullPath" -ForegroundColor Cyan
} else {
    Write-Host "Build completed but exe not found at expected path." -ForegroundColor Yellow
    exit 1
}
