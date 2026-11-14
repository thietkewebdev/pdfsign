# pdfsign-signer-rust

PDFSign desktop signer rewritten in Rust: offline PAdES signing with PKCS#11 USB tokens,
Windows x64 first. Production apps `pdfsignpro-signer-wpf/` and `pdfsignpro-cloud/` are untouched.

Docs (Vietnamese): [`docs/ANALYSIS.md`](docs/ANALYSIS.md) (how the WPF + pyHanko signer works),
[`docs/COMPARE.md`](docs/COMPARE.md) (signature diff vs the WPF output),
[`docs/TEST-TOKEN-THAT.md`](docs/TEST-TOKEN-THAT.md) (Windows test checklist with real tokens).

## Features (offline mode)

- Batch signing: many PDFs at once with the same boxes/template, output folder + file suffix.
- Several signatures per file: one incremental signature per box (earlier signatures stay valid).
- Saved signature templates: seal image, handwritten signature image, text lines with placeholders
  (`{name} {cn} {org} {date} {reason} {location} {issuer} {serial}`), layouts (image left/top/background,
  text only), border, tick icon, colors, font size, date format. Stored per user.
- PDF preview with page navigation; draw, drag and resize boxes with a live stamp preview; rotated pages handled.
- PAdES B-B, B-T (RFC 3161, configurable TSA list), B-LT (chain via AIA, OCSP with CRL fallback, DSS + VRI),
  B-LTA (document timestamp + DSS for its TSA).
- Verify tab: per signature integrity, signer, claimed time, timestamp, chain, trust (user-added root CAs),
  revocation from the DSS, LTV, PAdES level, document timestamps.
- Remembers the last token module/slot and certificate serial, never the PIN.
- Tokens without raw RSA: uses `CKM_SHA256_RSA_PKCS` when `CKM_RSA_PKCS` is missing or refused; per-signature
  login for `CKA_ALWAYS_AUTHENTICATE` keys.

## Layout

| Path | Role |
|---|---|
| `crates/pdfsign-core` | PDF incremental update, CAdES/PAdES CMS, appearance templates, TSA, LTV (AIA/OCSP/CRL/DSS), document timestamps, verification |
| `crates/pdfsign-token` | PKCS#11 via `cryptoki`: module discovery (port of the WPF list, Viettel first), slots, certs, key matching by modulus, mechanism fallback |
| `crates/pdfsign-app` | Application layer shared by GUI and CLI: settings, template store, batch/multi-signature jobs, verify view, and the `remote` seam for the later web mode |
| `crates/pdfsign-cli` | `pdfsign` CLI |
| `apps/pdfsign-gui` | Tauri v2 desktop app "PDFSign" (separate Cargo workspace), Vietnamese UI |

Web mode (`pdfsignpro://` + bridge on 127.0.0.1:17886) is not implemented. It plugs in through
`pdfsign_app::remote::RemoteJobSource`, which produces the same `SignJob` the offline UI builds.

## Windows installers

CI (`.github/workflows/pdfsign-signer-rust.yml`, runs only on changes under `pdfsign-signer-rust/**`) builds:

| Artifact | Contents |
|---|---|
| `pdfsign-windows-installers` | `PDFSign_0.1.0_x64-setup.exe` (NSIS, per-user, no admin), `PDFSign_0.1.0_x64_en-US.msi` |
| `pdfsign-windows-x64` | `pdfsign.exe` (CLI), `pdfsign-gui.exe` (portable GUI) |
| `pdfsign-linux-x64` | Linux CLI |

The installers are not Authenticode-signed yet. SmartScreen shows "Windows protected your PC": click
"More info" then "Run anyway". WebView2 is preinstalled on Windows 10/11; otherwise the setup downloads it.
The CLI is installed next to the app (`%LOCALAPPDATA%\PDFSign\pdfsign.exe` for the NSIS per-user install).

Build locally on Windows: `cargo build --release -p pdfsign-cli`, then in `apps/pdfsign-gui`
`npx @tauri-apps/cli@2 build --bundles nsis,msi`.

## CLI

```bash
pdfsign list-tokens                                   # modules + token slots (no PIN)
pdfsign list-certs [--module PATH] --json
pdfsign sign a.pdf b.pdf --out-dir out --suffix=-da-ky --pin-prompt \
  --box LAST:0.55,0.06,0.40,0.11 --box 1:0.05,0.06,0.40,0.11 \
  --level B-LT --tsa http://timestamp.digicert.com --template default --reason "Phê duyệt"
pdfsign verify signed.pdf --trust root-ca.cer [--json]
pdfsign templates
```

- `--box PAGE:x,y,w,h`: fractions of the displayed page, bottom-left origin (cloud `rectPct`); PAGE = number or LAST.
- PIN: hidden prompt or `--pin-stdin`; no PIN argument exists and PINs are never logged or saved.
- Errors print `ERRCODE:<CODE>` + a Vietnamese message (same codes as the WPF host).
- `PDFSIGN_PKCS11_MECHANISM=sha256-rsa-pkcs` forces hash-on-token signing (diagnostics).
- Settings/templates live in `%APPDATA%\PDFSign` (override with `PDFSIGN_CONFIG_DIR`).

## Testing without a hardware token

- `cargo test --workspace`: unit tests, software-key round trips, SoftHSM2 token test (skips if absent).
- `scripts/pki_services.py`: local TSA + OCSP + CRL + AIA for the `tests/fixtures/pki-ltv` test PKI;
  `PDFSIGN_PKI_SERVICES=1 cargo test` then also runs the B-T/B-LT/B-LTA test.
- `scripts/e2e-softhsm.sh`: SoftHSM2 end to end (single, hash-on-token, batch of 3, two signatures in one file,
  B-T, B-LT, B-LTA, wrong PIN), validated with `pyhanko sign validate`, `pyhanko sign adesverify`,
  pyHanko PAdES-LT/LTA (`LTV_PYTHON` = python with pyHanko <= 0.29), `pdfsig`, `qpdf --check`.
- `scripts/compare-pyhanko.sh`: same key signed by the production Python core and by Rust, structural dump.
- Test PKIs in `tests/fixtures/pki*` are public and must never be trusted.

## Roadmap

1. Done: offline signer (above), Windows installers in CI.
2. Real-token validation on Windows with Viettel, VNPT, BKAV (`docs/TEST-TOKEN-THAT.md`); pin verified driver paths and
   Vietnamese CA TSA URLs.
3. Authenticode signing of installers, auto-update, start with Windows, tray.
4. Web mode: deep link, claim/get/complete job API, local bridge 17886 (seam: `pdfsign_app::remote`).
5. Later: ECDSA keys, encrypted PDFs, PDF/A-aware appearances, macOS (paused).
