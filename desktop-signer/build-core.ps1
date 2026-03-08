# Build PDFSignProSignerCore.exe from sign_core.py (console, onefile)
# Used by PDFSignProSigner WPF app.

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $ScriptDir

python -c "import PyInstaller" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "PyInstaller not found. Install with: pip install pyinstaller" -ForegroundColor Yellow
    exit 1
}

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
$AddDataArgs = @()
if (Test-Path $AssetsFonts) {
    Get-ChildItem -Path $AssetsFonts -File -ErrorAction SilentlyContinue | ForEach-Object {
        $srcPath = $_.FullName.Replace("\", "/")
        $AddDataArgs += "--add-data", "${srcPath};assets/fonts"
    }
}

$DistPath = Join-Path $ScriptDir "dist-core"
$BuildPath = Join-Path $ScriptDir "build-core"
if (Test-Path $DistPath) { Remove-Item -Recurse -Force $DistPath }
if (Test-Path $BuildPath) { Remove-Item -Recurse -Force $BuildPath }

$PyInstallerArgs = @(
    "--onefile",
    "--console",
    "--name", "PDFSignProSignerCore",
    "--distpath", "dist-core",
    "--specpath", "build-core",
    "--workpath", "build-core",
    "--clean",
    "--collect-submodules", "pkcs11",
    "--hidden-import", "pkcs11.attributes",
    "sign_core.py"
) + $AddDataArgs

Write-Host "Building PDFSignProSignerCore.exe..."
python -m PyInstaller @PyInstallerArgs

if ($LASTEXITCODE -ne 0) {
    Write-Host "Build failed." -ForegroundColor Red
    exit 1
}

$ExePath = Join-Path $DistPath "PDFSignProSignerCore.exe"
if (Test-Path $ExePath) {
    Write-Host "Built: $ExePath" -ForegroundColor Green
} else {
    Write-Host "Exe not found." -ForegroundColor Red
    exit 1
}
