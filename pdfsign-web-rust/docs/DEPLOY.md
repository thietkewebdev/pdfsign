# Deploy PDFSign Web on Linux

Single release binary (`pdfsign-web`) serves the API and the built React SPA. SQL migrations run automatically on start.

## Target

- **glibc 2.34+ x86_64** (AlmaLinux / CloudLinux / RHEL 9): `cargo build --release`
- Optional **musl static** build (if you prefer a portable binary):

```bash
rustup target add x86_64-unknown-linux-musl
# needs musl-gcc on the build host
cargo build -p pdfsign-web --release --target x86_64-unknown-linux-musl
```

## Build on the server (or CI)

```bash
# From repo root
cd pdfsign-web-rust/web
npm ci
npm run build

cd ..
cargo build -p pdfsign-web --release
```

Artifacts:

| Path | Role |
|---|---|
| `target/release/pdfsign-web` | Server binary |
| `web/dist/` | SPA static files (`WEB_DIST`) |
| `migrations/` | Auto-applied on start |

Suggested install layout:

```text
/opt/pdfsign/
  bin/pdfsign-web
  web/dist/…
  migrations/…
  storage/
/etc/pdfsign/pdfsign-web.env
```

```bash
sudo mkdir -p /opt/pdfsign/{bin,web,migrations,storage}
sudo cp target/release/pdfsign-web /opt/pdfsign/bin/
sudo cp -a web/dist /opt/pdfsign/web/
sudo cp -a migrations /opt/pdfsign/
sudo cp deploy/pdfsign-web.env.example /etc/pdfsign/pdfsign-web.env
# edit secrets, then:
sudo cp deploy/pdfsign-web.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now pdfsign-web
```

Put nginx/caddy in front for TLS; proxy to `LISTEN` (default `127.0.0.1:8080`).

## Environment

| Variable | Required | Meaning |
|---|---|---|
| `DATABASE_URL` | yes | Postgres |
| `PUBLIC_BASE_URL` | yes (prod) | Public site/API base (also accepts `APP_URL`) |
| `JWT_SECRET` | yes (prod) | HS256 for launch/access JWTs (also `HMAC_SECRET`) |
| `STORAGE_DIR` | yes | Local PDF blob root |
| `WEB_DIST` | yes | Path to `index.html` + `assets/` |
| `FILE_RETENTION_HOURS` | no | Default `48` — hourly cleanup deletes blobs |
| `REGISTERED_TRIAL_FILES` | no | Default `5` one-time trial for plan=`free` |
| `ADMIN_TOKEN` | recommended | Bearer / `X-Admin-Token` for plan admin API |
| `COOKIE_SECURE` | prod | `1` behind HTTPS |
| `LISTEN` | no | Default `0.0.0.0:8080` |

## Admin: set user plan

```bash
curl -X POST -H "X-Admin-Token: $ADMIN_TOKEN" -H 'Content-Type: application/json' \
  -d '{"plan":"business","planPeriod":"yearly"}' \
  https://pdfsign.example.com/api/v1/admin/users/user@email/plan
```

Plans: `free` | `personal` | `business` | `unlimited`.

Or open `/admin` when logged in as a user with `role=ADMIN`.

## Health

`GET /api/v1/health` → `{ "ok": true, "protocol": 1, ... }`
