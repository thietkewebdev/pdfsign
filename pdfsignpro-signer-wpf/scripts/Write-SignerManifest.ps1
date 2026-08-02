# Write signer-manifest.json (+ optional .sha256 sidecar) after building Setup.
param(
    [Parameter(Mandatory = $true)]
    [string]$SetupPath,
    [string]$Version = "1.0.4",
    [string]$DownloadUrl = "https://pdfsign.vn/api/signer/download",
    [string]$OutPath = "",
    [string]$ReleaseNotes = ""
)

$ErrorActionPreference = "Stop"
if (-not (Test-Path $SetupPath)) {
    Write-Host "Setup not found: $SetupPath" -ForegroundColor Red
    exit 1
}

$SetupPath = (Resolve-Path $SetupPath).Path
$hash = (Get-FileHash -Path $SetupPath -Algorithm SHA256).Hash.ToLowerInvariant()
$size = (Get-Item $SetupPath).Length

if (-not $OutPath) {
    $OutPath = Join-Path (Split-Path -Parent $PSScriptRoot) "signer-manifest.json"
}

$manifest = [ordered]@{
    version      = $Version
    downloadUrl  = $DownloadUrl
    sha256       = $hash
    sizeBytes    = $size
    releaseNotes = $ReleaseNotes
    publishedAt  = (Get-Date).ToUniversalTime().ToString("o")
    channel      = "stable"
}

$json = $manifest | ConvertTo-Json -Depth 4
Set-Content -Path $OutPath -Value $json -Encoding UTF8
Set-Content -Path ($SetupPath + ".sha256") -Value "$hash  $(Split-Path -Leaf $SetupPath)" -Encoding ASCII

Write-Host "Manifest written: $OutPath" -ForegroundColor Green
Write-Host "  version = $Version"
Write-Host "  sha256  = $hash"
Write-Host "  size    = $size"
