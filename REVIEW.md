# PDFSign production review (signer + web)

Branch: `cursor/desktop-v030-downloads-6be7` · Target: sv14 (Linux, systemd, Postgres 16, LiteSpeed proxy)

## Critical

| ID | Area | Finding | Status |
|----|------|---------|--------|
| C1 | Web authz | Job create / status for logged-in users allow `user_id IS NULL` → IDOR on guest docs | **Fixed** exact ownership filters |
| C2 | Handshake | `launch_used_at` check then update without claiming row → concurrent double handshake | **Fixed** atomic claim; re-handshake while `READY` |
| C3 | Complete | Race can double-insert versions / double-count quota | **Fixed** claim `READY→COMPLETING` + release on failure |
| C4 | Secrets | Default JWT secret ships if env unset | **Fixed** refuse boot unless `JWT_SECRET` ≥32 (or `PDFSIGN_ALLOW_INSECURE_DEV=1`) |
| C5 | Desktop | Deep link cleared before success; launch burned → Windows sign retries fail | **Fixed** keep pending link; re-handshake; parse server error codes |

## High

| ID | Area | Finding | Status |
|----|------|---------|--------|
| H1 | Crypto | Download “HMAC” is raw SHA256; timing-leaky compare | **Fixed** real HMAC-SHA256 + constant-time verify |
| H2 | CORS | `allow_origin(Any)` | **Fixed** `CORS_ORIGINS` allowlist |
| H3 | Rate limit | No limits on auth/upload/job/handshake | **Fixed** in-process token bucket (120/min) |
| H4 | Guest quota | Cookie/FP reset bypasses 2-file limit | **Fixed** also count by `ip_hash` |
| H5 | Upload | Multipart may skip `%PDF` magic | **Fixed** require `%PDF-` header |
| H6 | Desktop | No support log; opaque `GENERAL` errors | **Fixed** `%APPDATA%/PDFSign/logs/pdfsign.log` + coded errors |
| H7 | Desktop | API base from deep-link `&u=` / JWT without allowlist | **Fixed** prefer configured base; same-host download check |
| H8 | UX | Ký button not sticky on sign page | **Fixed** sticky action bar (web + desktop) |
| H9 | Opener | `openUrl` may lack capability | **Fixed** allow https / localhost open-url |

## Medium

| ID | Finding | Status |
|----|---------|--------|
| M1 | No forgot-password / change-password | **Backlog** — needs owner email provider |
| M2 | Settings read-only; quota unused in UI | **Partial** — settings shows hạn mức from `/billing/quota` |
| M3 | Retention leaves upload parts / sessions | **Backlog** sweeper |
| M4 | Plan quota race at complete | **Mitigated** by complete claim |
| M5 | Document metadata public by publicId | **Fixed** require owner/guest for `get_one` |
| M6 | ContentsTooSmall no retry | **Backlog** |
| M7 | Installers unsigned (SmartScreen) | **Owner decision** — code-signing cert |
| M8 | ECDSA tokens unsupported | **Backlog** |

## Low

Portable `register_all`, README drift, SoftHSM only on Linux CI, admin token UX, empty-state polish.

## End-to-end path

`upload → /d/:id → Ký → pdfsign://v1/sign?t=… → handshake → job/file → PKCS#11 PIN → complete → poll`

Root causes for “could not get working on Windows” (0.3.0):
1. `listen is not defined` — fixed in 0.3.1
2. Launch JWT one-shot + UI clearing deep link on first failure — fixed in 0.3.2
3. Opaque errors / no log file for real-token PKCS#11 failures — fixed in 0.3.2

## Tests

- `pdfsign-app` unit: deep link parse, same-host download allowlist
- `pdfsign-web` unit: HMAC roundtrip/tamper
- CI SoftHSM `e2e-web-job.sh` (full protocol v1)
- CI `test-job-security.sh` (IDOR + handshake re-entry + complete claim)
- CI `test-storage-auth.sh`, `test-guest-limit.sh`
