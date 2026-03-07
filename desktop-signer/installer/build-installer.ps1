# Build PDFSignPro Signer installer (Inno Setup)
# 1. Build PyInstaller exe if needed
# 2. Run ISCC to create PDFSignProSignerSetup.exe in dist-installer/

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = Join-Path $ScriptDir ".."
Set-Location $ProjectRoot

# Inno Setup ISCC path (default or env override)
$IsccPath = $env:INNO_SETUP_ISCC
if (-not $IsccPath) {
    $IsccPath = Join-Path ${env:ProgramFiles(x86)} "Inno Setup 6\ISCC.exe"
}
if (-not (Test-Path $IsccPath)) {
    Write-Host "Inno Setup not found at: $IsccPath" -ForegroundColor Red
    Write-Host "Install from: https://jrsoftware.org/isdl.php" -ForegroundColor Yellow
    Write-Host "Or set INNO_SETUP_ISCC to full path of ISCC.exe" -ForegroundColor Yellow
    exit 1
}

# 1. Build PyInstaller exe if needed
$ExePath = Join-Path (Join-Path $ProjectRoot "dist") "PDFSignProSigner.exe"
if (-not (Test-Path $ExePath)) {
    Write-Host "PDFSignProSigner.exe not found. Running build.ps1..." -ForegroundColor Cyan
    & (Join-Path $ProjectRoot "build.ps1")
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Build failed." -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "Using existing: $ExePath" -ForegroundColor Gray
}

# 2. Build installer
$IssPath = Join-Path $ScriptDir "PDFSignProSigner.iss"
Write-Host "Running Inno Setup compiler..." -ForegroundColor Cyan
& $IsccPath $IssPath

if ($LASTEXITCODE -ne 0) {
    Write-Host "Installer build failed." -ForegroundColor Red
    exit 1
}

$SetupPath = Join-Path (Join-Path $ProjectRoot "dist-installer") "PDFSignProSignerSetup.exe"
if (Test-Path $SetupPath) {
    $FullPath = (Resolve-Path $SetupPath).Path
    Write-Host ""
    Write-Host "Installer build complete:" -ForegroundColor Green
    Write-Host "  $FullPath" -ForegroundColor Cyan
} else {
    Write-Host "Build completed but installer not found at expected path." -ForegroundColor Yellow
    exit 1
}
