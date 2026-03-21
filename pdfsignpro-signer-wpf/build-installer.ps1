# Build PDFSignPro Signer installer
# Produces PDFSignProSignerSetup.exe in dist-installer/
# Requires: .NET 8 SDK, Python + PyInstaller, Inno Setup 6
# WPF is published self-contained (win-x64) so end users do not need .NET Desktop Runtime.

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = $ScriptDir
$DesktopSignerRoot = Join-Path (Split-Path -Parent $ProjectRoot) "desktop-signer"

Set-Location $ProjectRoot

# Inno Setup
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

# 1. Build WPF app
Write-Host "Building WPF app..." -ForegroundColor Cyan
$PublishDir = Join-Path $ProjectRoot "publish"
if (Test-Path $PublishDir) { Remove-Item -Recurse -Force $PublishDir }
dotnet publish PDFSignProSigner\PDFSignProSigner.csproj -c Release -r win-x64 --self-contained true `
    -p:PublishReadyToRun=true -o $PublishDir
if ($LASTEXITCODE -ne 0) {
    Write-Host "WPF build failed." -ForegroundColor Red
    exit 1
}
Write-Host "WPF build complete." -ForegroundColor Green

# 2. Build PDFSignProSignerCore.exe
Write-Host "Building PDFSignProSignerCore.exe..." -ForegroundColor Cyan
& (Join-Path $DesktopSignerRoot "build-core.ps1")
if ($LASTEXITCODE -ne 0) {
    Write-Host "Core build failed." -ForegroundColor Red
    exit 1
}

# Copy core exe to publish so it's alongside the WPF exe
$CoreExe = Join-Path $DesktopSignerRoot "dist-core\PDFSignProSignerCore.exe"
if (Test-Path $CoreExe) {
    Copy-Item $CoreExe -Destination $PublishDir -Force
    Write-Host "Copied PDFSignProSignerCore.exe to publish." -ForegroundColor Green
} else {
    Write-Host "PDFSignProSignerCore.exe not found." -ForegroundColor Red
    exit 1
}

# 3. Ensure assets/fonts exists (optional)
$AssetsFonts = Join-Path $DesktopSignerRoot "assets\fonts"
if (-not (Test-Path $AssetsFonts)) {
    New-Item -ItemType Directory -Path $AssetsFonts -Force | Out-Null
    Write-Host "Created assets/fonts (add font files if needed)." -ForegroundColor Gray
}

# 4. Run Inno Setup
$IssPath = Join-Path $ProjectRoot "installer\PDFSignProSigner.iss"
Write-Host "Running Inno Setup..." -ForegroundColor Cyan
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
    Write-Host "Installer not found at expected path." -ForegroundColor Yellow
    exit 1
}
