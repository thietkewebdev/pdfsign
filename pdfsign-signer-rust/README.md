# pdfsign-signer-rust

Rust rewrite of the PDFSign desktop signer (phase 1: offline signing). Production apps
`pdfsignpro-signer-wpf/` and `pdfsignpro-cloud/` are untouched.

Docs (Vietnamese): [`docs/ANALYSIS.md`](docs/ANALYSIS.md) (how the WPF + pyHanko signer works),
[`docs/COMPARE.md`](docs/COMPARE.md) (signature diff vs the WPF output),
[`docs/TEST-TOKEN-THAT.md`](docs/TEST-TOKEN-THAT.md) (real token test checklist).

## Layout

| Crate | Role |
|---|---|
| `crates/pdfsign-core` | Incremental-update signing (classic xref and xref streams), PAdES B-B (`ETSI.CAdES.detached`, SHA-256, RSA PKCS#1 v1.5, signing-certificate-v2), optional RFC 3161 TSA (B-T), visible stamp (Noto Sans subset, Vietnamese), signature self-check |
| `crates/pdfsign-token` | PKCS#11 via `cryptoki`: module discovery (port of the WPF/Python list, Viettel first), slots, certificates, PIN login, key matching, signing |
| `crates/pdfsign-cli` | `pdfsign` binary: `list-tokens`, `list-certs`, `sign`, `verify` |

## Build

Requirements: Rust stable 1.85+; Windows needs the MSVC build tools, macOS the Xcode command line tools.
No system libraries are needed (PKCS#11 modules are loaded at runtime).

```bash
cd pdfsign-signer-rust
cargo build --release -p pdfsign-cli      # -> target/release/pdfsign(.exe)
cargo test --workspace
```

CI (`.github/workflows/pdfsign-signer-rust.yml`, only runs on changes under `pdfsign-signer-rust/**`) uploads
`pdfsign-windows-x64`, `pdfsign-macos-universal` and `pdfsign-linux-x64` artifacts.

## Run

```bash
pdfsign list-tokens                         # discovered modules + token slots (no PIN)
pdfsign list-certs [--module PATH] --json   # same JSON shape as PDFSignProSignerCore --list-certs
pdfsign sign --in in.pdf --out out.pdf --pin-prompt \
  [--module PATH] [--slot 0] [--cert 0|serial:HEX] \
  [--page LAST|N] [--rect 0.64,0.06,0.32,0.10] [--image seal.png] [--tsa URL] [--reason ...] [--location ...]
pdfsign verify out.pdf                      # integrity + signature value (not trust validation)
```

- `--rect` is `rectPct` from the cloud job API: fractions of the displayed page, bottom-left origin.
- PIN: hidden prompt (`--pin-prompt`, default for `sign`) or first line of stdin (`--pin-stdin`, for automation).
  There is no PIN argument; PINs are never logged.
- Errors print `ERRCODE:<CODE>` plus a Vietnamese message on stderr, same codes as the WPF host
  (`PIN_INCORRECT`, `PIN_LOCKED`, `TOKEN_NOT_FOUND`, `NO_PKCS11_DLL`, ...).
- Module override: `--module`, or env `PDFSIGN_PKCS11_MODULE` / `PKCS11_DLL`.

## Testing without a hardware token

- `cargo test --workspace`: unit tests, round trips with a software key (classic xref, xref stream, rotated page,
  image, double signature, tamper detection, `qpdf --check` when present) and a SoftHSM2 PKCS#11 test that
  skips itself when SoftHSM2 is not installed.
- `scripts/e2e-softhsm.sh [OUT]`: creates a SoftHSM2 token, imports the test key, runs the CLI through PKCS#11,
  then validates with `pyhanko sign validate`, `pdfsig`, `qpdf --check` and renders the page with `pdftoppm`.
- `scripts/compare-pyhanko.sh [OUT]`: signs the same PDF with the production Python core and with Rust, dumps both.
- Test PKI in `tests/fixtures/pki` (regenerate with `scripts/gen-test-pki.sh`) is public and must never be trusted.
  The CLI also accepts `--soft-key/--soft-cert/--soft-chain` (PEM) for tests only.

## Phase 1 roadmap

1. Done here: core signing (B-B, B-T), PKCS#11 token access, CLI, CI artifacts, SoftHSM2 tests.
2. Real-token validation on Windows and macOS with Viettel, VNPT, BKAV (see `docs/TEST-TOKEN-THAT.md`);
   pin macOS module paths per vendor; handle tokens without `CKM_RSA_PKCS` (fallback to `CKM_SHA256_RSA_PKCS`
   by signing the attributes, not the digest) and `CKA_ALWAYS_AUTHENTICATE` keys.
3. Job flow parity: `pdfsignpro://` deep link, claim/get/complete API, `certMeta` upload, seal image download.
4. Local bridge parity on `127.0.0.1:17886` (`/health`, `/ready`, `/certs`) with the same CORS allowlist.
5. GUI (below), tray, single instance, auto-update, installers (MSI/Inno on Windows, signed + notarized `.app`/`.dmg`).
6. Then: B-LT (DSS with OCSP/CRL), ECDSA keys, encrypted PDFs, PDF/A-friendly appearance.

## GUI recommendation: Tauri v2

Pick **Tauri v2** over egui:

- Placing the box needs a PDF renderer. Tauri can reuse pdf.js and the placement/stamp preview already built in
  `pdfsignpro-cloud` (same `rectPct` contract, same `StampValidPreview` layout). egui would need pdfium
  binaries per platform plus a rewrite of that UI.
- Vietnamese text, IME and accessibility come for free from the system webview; egui's text shaping and IME are weaker.
- Plugins cover the desktop needs: deep links (`pdfsignpro://`), single instance, tray, autostart, signed updater.
- Small footprint: WebView2 is preinstalled on Windows 10/11, WKWebView on macOS; signing logic stays in these crates
  and is exposed as Tauri commands. The PIN only crosses the IPC boundary once per signing and is kept as `AuthPin`.

egui remains a good choice for an internal diagnostic tool (no web stack), but not for the end-user signer.
