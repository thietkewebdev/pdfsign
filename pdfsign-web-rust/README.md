# PDFSign Web (Rust)

Axum + SQLx (PostgreSQL) + React (Vite). Path-depends on `pdfsign-signer-rust/crates/pdfsign-core`.

Kế hoạch đầy đủ: [`docs/WEB-PLAN.md`](docs/WEB-PLAN.md).

## Chạy local

```bash
# Postgres (docker hoặc máy sẵn có)
docker compose up -d db
# hoặc: postgres://pdfsign:pdfsign@127.0.0.1:5432/pdfsign

export DATABASE_URL=postgres://pdfsign:pdfsign@127.0.0.1:5432/pdfsign
export APP_URL=http://localhost:8080
export APP_PUBLIC_HOST=localhost
export STORAGE_DIR=./storage

cd pdfsign-web-rust
cargo run -p pdfsign-web

# UI (terminal khác)
cd web && npm install && npm run dev
# http://localhost:5173  (proxy /api → :8080)
```

Build UI vào `web/dist` rồi server phục vụ tĩnh:

```bash
cd web && npm run build
WEB_DIST=web/dist cargo run -p pdfsign-web
```

## E2E SoftHSM (job flow)

Cần `pdfsign` CLI đã build và SoftHSM như `pdfsign-signer-rust/scripts/e2e-softhsm.sh`.

```bash
./scripts/e2e-web-job.sh
```

## Migration (read-only export)

```bash
./scripts/migrate-export.sh   # chỉ đọc DB nguồn (staging), không prod
# ./scripts/migrate-import.sh # import vào DB mới (staging)
```

## Biến môi trường

| Biến | Mặc định | Ý nghĩa |
|---|---|---|
| `DATABASE_URL` | local pdfsign | Postgres |
| `APP_URL` | `http://localhost:8080` | Base URL deep link / file |
| `APP_PUBLIC_HOST` | host của APP_URL | Field `h` trong `pdfsignpro://` |
| `SIGNING_JOB_EXPIRES_MINUTES` | 90 | Hết hạn job |
| `SERVER_UPGRADE_LEVEL` | (trống) | `B-LT` / `B-LTA` sau complete |
| `TSA_URL` | DigiCert | TSA khi nâng B-LTA |
| `STORAGE_DIR` | `./storage` | File local |
| `WEB_DIST` | `web/dist` | Static UI |
