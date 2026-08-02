# Build PDFSignPro Signer installer
# Produces PDFSignProSignerSetup.exe in dist-installer/
# Requires: .NET 8 SDK, Python + PyInstaller, Inno Setup 6
# Optional Authenticode: CODE_SIGN_THUMBPRINT or CODE_SIGN_PFX (+ CODE_SIGN_PFX_PASSWORD)
# WPF is published self-contained (win-x64) so end users do not need .NET Desktop Runtime.

param(
    [switch]$RequireSign
)

$ErrorActionPreference = "Stop"
$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$ProjectRoot = $ScriptDir
$DesktopSignerRoot = Join-Path (Split-Path -Parent $ProjectRoot) "desktop-signer"
$SignScript = Join-Path $ProjectRoot "scripts\Sign-Authenticode.ps1"
$ManifestScript = Join-Path $ProjectRoot "scripts\Write-SignerManifest.ps1"

Set-Location $ProjectRoot

function Invoke-SignFiles {
    param([string[]]$Files)
    if (-not (Test-Path $SignScript)) {
        Write-Host "Sign script missing: $SignScript" -ForegroundColor Yellow
        return
    }
    $signArgs = @{ Path = $Files }
    if ($RequireSign) { $signArgs.Required = $true }
    & $SignScript @signArgs
    if ($LASTEXITCODE -ne 0 -and $RequireSign) {
        Write-Host "Authenticode signing required but failed." -ForegroundColor Red
        exit $LASTEXITCODE
    }
}

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

# Read version from csproj
$Csproj = Join-Path $ProjectRoot "PDFSignProSigner\PDFSignProSigner.csproj"
$Version = "1.0.4"
if (Test-Path $Csproj) {
    $m = Select-String -Path $Csproj -Pattern "<Version>([^<]+)</Version>" | Select-Object -First 1
    if ($m) { $Version = $m.Matches[0].Groups[1].Value }
}

# 1. Build WPF app
Write-Host "Building WPF app (v$Version)..." -ForegroundColor Cyan
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

# 3b. Authenticode-sign binaries BEFORE packing into Setup
$WpfExe = Join-Path $PublishDir "PDFSignProSigner.exe"
$CoreInPublish = Join-Path $PublishDir "PDFSignProSignerCore.exe"
Write-Host "Authenticode (payload)..." -ForegroundColor Cyan
Invoke-SignFiles -Files @($WpfExe, $CoreInPublish)

# 4. Run Inno Setup
$IssPath = Join-Path $ProjectRoot "installer\PDFSignProSigner.iss"
Write-Host "Running Inno Setup..." -ForegroundColor Cyan
& $IsccPath $IssPath

if ($LASTEXITCODE -ne 0) {
    Write-Host "Installer build failed." -ForegroundColor Red
    exit 1
}

$SetupPath = Join-Path (Join-Path $ProjectRoot "dist-installer") "PDFSignProSignerSetup.exe"
if (-not (Test-Path $SetupPath)) {
    Write-Host "Installer not found at expected path." -ForegroundColor Yellow
    exit 1
}

# 5. Sign the Setup itself (SmartScreen reputation)
Write-Host "Authenticode (Setup)..." -ForegroundColor Cyan
Invoke-SignFiles -Files @($SetupPath)

# 6. Write manifest with sha256 for in-app updater
Write-Host "Writing signer-manifest.json..." -ForegroundColor Cyan
& $ManifestScript -SetupPath $SetupPath -Version $Version `
    -DownloadUrl "https://pdfsign.vn/api/signer/download" `
    -ReleaseNotes "Per-user install, readiness checklist, in-app auto-update."

$FullPath = (Resolve-Path $SetupPath).Path
Write-Host ""
Write-Host "Installer build complete:" -ForegroundColor Green
Write-Host "  $FullPath" -ForegroundColor Cyan
Write-Host "  Manifest: pdfsignpro-signer-wpf\signer-manifest.json" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next:" -ForegroundColor Yellow
Write-Host "  1. Upload Setup to R2 (SIGNER_R2_KEY=signer/PDFSignProSignerSetup.exe)"
Write-Host "  2. Commit/push updated signer-manifest.json to main (updater reads GitHub raw)"
Write-Host "  3. Optional: set CODE_SIGN_* env vars and rebuild with -RequireSign for release"
