# PDFSignPro Signer (WPF)

Windows desktop bridge for USB-token PAdES signing. Opens via `pdfsignpro://`, talks to the cloud job API, and shells `PDFSignProSignerCore.exe` (Python/pyHanko).

## Installer (v1.0.4+)

- **Per-user** Inno Setup — no Administrator / UAC
- Install dir: `%LOCALAPPDATA%\PDFSignProSigner`
- Protocol: `pdfsignpro://` registered under **HKCU**
- Optional: start with Windows (`--minimized` tray + local bridge on `127.0.0.1:17886`)

### Build

Requirements: .NET 8 SDK, Python + PyInstaller, [Inno Setup 6](https://jrsoftware.org/isdl.php).

```powershell
cd pdfsignpro-signer-wpf
.\build-installer.ps1
# → dist-installer\PDFSignProSignerSetup.exe
```

Upload that Setup to R2 and set `SIGNER_R2_KEY=signer/PDFSignProSignerSetup.exe`.

### Local bridge readiness

| Endpoint | Purpose |
|----------|---------|
| `GET /health` | App version, `coreExists`, PKCS#11 probe (`pkcs11.found`, `dllCount`) |
| `GET /ready` | Same as `/health` |
| `POST /certs` | List certs (requires PIN) |

The web checklist on `/d/...` polls `/health` to show whether Signer is running and whether token middleware DLLs were discovered.

### Migrating from old admin install

Old builds installed to Program Files and registered `pdfsignpro://` in HKLM. Users should uninstall that build first (Settings → Apps), then install 1.0.4+ Setup so the protocol points at the per-user copy.
