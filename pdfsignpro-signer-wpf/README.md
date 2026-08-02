# PDFSignPro Signer (WPF)

Windows desktop bridge for USB-token PAdES signing. Opens via `pdfsignpro://`, talks to the cloud job API, and shells `PDFSignProSignerCore.exe` (Python/pyHanko).

## Installer (v1.0.4+)

- **Per-user** Inno Setup — no Administrator / UAC
- Install dir: `%LOCALAPPDATA%\PDFSignProSigner`
- Protocol: `pdfsignpro://` registered under **HKCU**
- Optional: start with Windows (`--minimized` tray + local bridge on `127.0.0.1:17886`)
- **In-app auto-update**: downloads Setup, verifies SHA-256 (if set in manifest), runs `/SILENT` install, exits app
- **Authenticode** (optional): sign payload + Setup when cert env vars are set

## Build on your Windows machine

Requirements:

- .NET 8 SDK
- Python 3 + PyInstaller (for Core)
- [Inno Setup 6](https://jrsoftware.org/isdl.php)
- (Optional) Windows SDK `signtool` + code-signing cert

```powershell
cd pdfsignpro-signer-wpf

# Optional Authenticode (pick ONE):
#   $env:CODE_SIGN_THUMBPRINT = "AABBCC..."          # cert in Windows store
#   $env:CODE_SIGN_PFX = "C:\certs\codesign.pfx"
#   $env:CODE_SIGN_PFX_PASSWORD = "secret"
#   $env:CODE_SIGN_TIMESTAMP_URL = "http://timestamp.digicert.com"  # optional
#   $env:SIGNTOOL_PATH = "C:\...\signtool.exe"       # optional override

.\build-installer.ps1
# Release builds that MUST be signed:
# .\build-installer.ps1 -RequireSign

# → dist-installer\PDFSignProSignerSetup.exe
# → signer-manifest.json (sha256 filled)
# → dist-installer\PDFSignProSignerSetup.exe.sha256
```

### Ship checklist

1. Upload `PDFSignProSignerSetup.exe` to R2  
   `SIGNER_R2_KEY=signer/PDFSignProSignerSetup.exe`
2. Commit & push updated `signer-manifest.json` to **main**  
   (updater reads  
   `https://raw.githubusercontent.com/thietkewebdev/pdfsign/main/pdfsignpro-signer-wpf/signer-manifest.json`)
3. Without Authenticode, Windows SmartScreen may still warn until reputation builds — signing strongly recommended for production.

### Authenticode scripts

| Script | Role |
|--------|------|
| `scripts/Sign-Authenticode.ps1` | `signtool sign` helper (skips if no cert) |
| `scripts/Write-SignerManifest.ps1` | SHA-256 + manifest JSON after build |

## Local bridge readiness

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | App version, `coreExists`, PKCS#11 probe (`pkcs11.found`, `dllCount`) |
| `GET /ready` | Same as `/health` |
| `POST /certs` | List certs (requires PIN) |

The web checklist on `/d/...` polls `/health` to show whether Signer is running and whether token middleware DLLs were discovered.

## Auto-update flow

1. On startup (or “Kiểm tra cập nhật ngay”), fetch `signer-manifest.json`
2. If `version` &gt; local → ask user
3. Download Setup from `downloadUrl` (default `/api/signer/download`)
4. Verify `sha256` when non-empty
5. Launch  
   `Setup.exe /SILENT /CLOSEAPPLICATIONS /FORCECLOSEAPPLICATIONS /NORESTART`
6. Exit Signer so Inno can replace files under LocalAppData

Override manifest URL via `%LocalAppData%\PDFSignProSigner\settings.json` → `updateManifestUrlOverride`.

## Migrating from old admin install

Old builds installed to Program Files and registered `pdfsignpro://` in HKLM. Users should uninstall that build first (Settings → Apps), then install 1.0.4+ Setup so the protocol points at the per-user copy.
