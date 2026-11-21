# PDFSign Web (Rust) — protocol v1

Axum + SQLx (PostgreSQL) + React (Vite). Path-depends on `pdfsign-core`.
Desktop client: `pdfsign web-sign --deep-link 'pdfsign://v1/sign?t=...'`.

Plan: [`docs/WEB-PLAN.md`](docs/WEB-PLAN.md). Fresh design (no WPF / no DB migration).

## Run locally

```bash
docker compose up -d db
export DATABASE_URL=postgres://pdfsign:pdfsign@127.0.0.1:5432/pdfsign
export APP_URL=http://127.0.0.1:8080
export JWT_SECRET=dev-pdfsign-jwt-secret-change-me
export STORAGE_DIR=./storage

cargo run -p pdfsign-web
cd web && npm install && npm run build
# or: npm run dev  (proxy /api → :8080)
```

## SoftHSM e2e (web → desktop → web)

```bash
./scripts/e2e-web-job.sh
./scripts/e2e-web-guest.sh   # guest upload → web-sign → COMPLETED
./scripts/test-guest-limit.sh  # 2 free completed signatures, 3rd → GUEST_LIMIT_REACHED
```

Guests get 2 free completed signatures (cookie `pdfsign_guest` + fingerprint header). Register/login attaches guest documents to the account.

## Env

| Var | Default | Meaning |
|---|---|---|
| `DATABASE_URL` | local pdfsign | Postgres |
| `APP_URL` | `http://127.0.0.1:8080` | Public API base (embedded in launch JWT) |
| `JWT_SECRET` | dev default | HS256 for launch/access tokens |
| `SIGNING_JOB_EXPIRES_MINUTES` | 90 | Job TTL |
| `LAUNCH_TTL_MINUTES` | 15 | Launch JWT TTL |
| `PUBLIC_BASE_URL` | (or `APP_URL`) | Public base URL |
| `FILE_RETENTION_HOURS` | 48 | Auto-delete blobs |
| `REGISTERED_TRIAL_FILES` | 5 | One-time trial for free accounts |
| `ADMIN_TOKEN` | — | Admin plan API |
| `WEB_DIST` | `web/dist` | SPA static dir |

Deploy: [`docs/DEPLOY.md`](docs/DEPLOY.md). Extra tests: `./scripts/test-retention.sh`, `./scripts/test-plan-quota.sh`.
| `SERVER_UPGRADE_LEVEL` | (empty) | `B-LT` / `B-LTA` after complete |
| `STORAGE_DIR` | `./storage` | Local files |
| `WEB_DIST` | `web/dist` | Static UI |
