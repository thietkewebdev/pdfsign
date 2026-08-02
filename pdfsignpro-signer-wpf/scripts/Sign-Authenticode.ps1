# Sign files with Authenticode (signtool).
# Used by build-installer.ps1. Skips gracefully when no cert is configured.
#
# Configure ONE of:
#   CODE_SIGN_THUMBPRINT   — cert thumbprint in CurrentUser/LocalMachine My store
#   CODE_SIGN_PFX          — path to .pfx
#   CODE_SIGN_PFX_PASSWORD — password for PFX (optional if PFX has no password)
#
# Optional:
#   SIGNTOOL_PATH          — full path to signtool.exe
#   CODE_SIGN_TIMESTAMP_URL — default DigiCert
#   CODE_SIGN_DESCRIPTION  — File description in signature

param(
    [Parameter(Mandatory = $true)]
    [string[]]$Path,
    [switch]$Required
)

$ErrorActionPreference = "Stop"

function Find-SignTool {
    if ($env:SIGNTOOL_PATH -and (Test-Path $env:SIGNTOOL_PATH)) {
        return $env:SIGNTOOL_PATH
    }
    $kits = Join-Path ${env:ProgramFiles(x86)} "Windows Kits\10\bin"
    if (Test-Path $kits) {
        $found = Get-ChildItem -Path $kits -Recurse -Filter "signtool.exe" -ErrorAction SilentlyContinue |
            Where-Object { $_.FullName -match '\\x64\\signtool\.exe$' } |
            Sort-Object FullName -Descending |
            Select-Object -First 1
        if ($found) { return $found.FullName }
    }
    $cmd = Get-Command signtool.exe -ErrorAction SilentlyContinue
    if ($cmd) { return $cmd.Source }
    return $null
}

$thumb = ""; if ($env:CODE_SIGN_THUMBPRINT) { $thumb = $env:CODE_SIGN_THUMBPRINT.Trim() }
$pfx = ""; if ($env:CODE_SIGN_PFX) { $pfx = $env:CODE_SIGN_PFX.Trim() }
$pfxPass = $env:CODE_SIGN_PFX_PASSWORD
$timestamp = if ($env:CODE_SIGN_TIMESTAMP_URL) { $env:CODE_SIGN_TIMESTAMP_URL } else { "http://timestamp.digicert.com" }
$desc = if ($env:CODE_SIGN_DESCRIPTION) { $env:CODE_SIGN_DESCRIPTION } else { "PDFSignPro Signer" }

$hasCert = ($thumb.Length -gt 0) -or ($pfx.Length -gt 0 -and (Test-Path $pfx))
if (-not $hasCert) {
    $msg = "Authenticode skipped (set CODE_SIGN_THUMBPRINT or CODE_SIGN_PFX to enable)."
    if ($Required) {
        Write-Host $msg -ForegroundColor Red
        exit 2
    }
    Write-Host $msg -ForegroundColor Yellow
    exit 0
}

$signtool = Find-SignTool
if (-not $signtool) {
    $msg = "signtool.exe not found. Install Windows SDK or set SIGNTOOL_PATH."
    if ($Required) {
        Write-Host $msg -ForegroundColor Red
        exit 3
    }
    Write-Host $msg -ForegroundColor Yellow
    exit 0
}

$files = @()
foreach ($p in $Path) {
    if (Test-Path $p) {
        $files += (Resolve-Path $p).Path
    } else {
        Write-Host "Sign skip (missing): $p" -ForegroundColor Yellow
    }
}
if ($files.Count -eq 0) {
    Write-Host "No files to sign." -ForegroundColor Yellow
    exit 0
}

foreach ($file in $files) {
    Write-Host "Signing: $file" -ForegroundColor Cyan
    $args = @(
        "sign",
        "/fd", "SHA256",
        "/td", "SHA256",
        "/tr", $timestamp,
        "/d", $desc
    )
    if ($thumb.Length -gt 0) {
        $args += @("/sha1", $thumb)
    } else {
        $args += @("/f", $pfx)
        if ($null -ne $pfxPass -and "$pfxPass".Length -gt 0) {
            $args += @("/p", $pfxPass)
        }
    }
    $args += $file

    & $signtool @args
    if ($LASTEXITCODE -ne 0) {
        Write-Host "Sign failed for $file (exit $LASTEXITCODE)" -ForegroundColor Red
        if ($Required) { exit $LASTEXITCODE }
        exit $LASTEXITCODE
    }
    Write-Host "Signed OK: $file" -ForegroundColor Green
}

exit 0
