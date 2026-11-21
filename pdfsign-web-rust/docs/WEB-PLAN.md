# Kế hoạch PDFSign Web (Rust) — thiết kế mới

App web viết mới trong `pdfsign-web-rust/`. Không migrate DB cũ, không tương thích WPF/`pdfsignpro://`. Chỉ desktop Rust (`pdfsign-signer-rust`) tham gia ký. Không đụng `pdfsignpro-cloud/` hay Railway.

## 1. Inventory hữu ích từ web cũ (chỉ lấy ý, không copy API)

- Auth email/mật khẩu, danh sách tài liệu, upload PDF, đặt ô chữ ký trên preview
- Job ký có hạn, poll trạng thái, tải bản đã ký
- Xác minh chữ ký, mẫu stamp, (sau) hợp đồng nhiều bên / gói / admin
- Placement: tỉ lệ 0..1 trên trang **đã xoay** (pdf.js), gốc dưới-trái → `pdfsign-core::RectPct`

Bỏ: claim code 8 hex, deep link `pdfsignpro://`, jobToken raw trong DB cho WPF, migration Prisma.

## 2. Giao thức v1 (web ↔ desktop Rust)

### 2.1 Deep link

```
pdfsign://v1/sign?t=<launch_jwt>
```

`launch_jwt` (HS256, secret server, TTL ~15 phút):

```json
{ "v": 1, "typ": "launch", "jti": "...", "job": "job_...", "api": "http://127.0.0.1:8080", "exp": ... }
```

Một lần dùng: server ghi `jti` đã consume khi handshake.

### 2.2 Handshake

`POST /api/v1/signer/handshake` `{ "launchToken": "<jwt>" }`

→ `{ "accessToken", "tokenType": "Bearer", "expiresAt", "jobId", "apiBase" }`

`accessToken` JWT TTL = hạn job (mặc định 90 phút), claims `{ typ:"access", job, scope:"sign" }`.

### 2.3 Lấy job + tải PDF

`GET /api/v1/signer/job` header `Authorization: Bearer <accessToken>`

```json
{
  "jobId": "job_...",
  "status": "ready",
  "document": { "title": "...", "publicId": "..." },
  "placement": { "page": 1, "rectPct": { "x", "y", "w", "h" } },
  "downloadUrl": "https://.../api/v1/signer/file?...",
  "sealImageUrl": null,
  "templateId": "valid",
  "idempotencyKey": "idem_..."
}
```

`downloadUrl` mang chữ ký ngắn hạn (query HMAC) hoặc dùng cùng Bearer.

### 2.4 Complete (idempotent)

`POST /api/v1/signer/complete`  
Headers: `Authorization: Bearer`, `Idempotency-Key: <idem_...>`  
Body: multipart `file` (PDF ≤ 25 MB) + `certMeta` (JSON)

- Lần đầu: verify PAdES bằng `pdfsign-core`, tùy chọn nâng B-LT/B-LTA, lưu version mới
- Trùng key: trả lại response đã lưu (không ký lại / không nhân bản version)

### 2.5 Health / handshake desktop

`GET /api/v1/health` → `{ ok, service, version, protocol: 1 }`

Desktop gọi health trước khi handshake; mã lỗi thống nhất:

| code | HTTP | nghĩa |
|---|---|---|
| `INVALID_TOKEN` | 401 | JWT hỏng / sai secret |
| `LAUNCH_USED` | 409 | launch đã dùng |
| `LAUNCH_EXPIRED` | 410 | launch hết hạn |
| `JOB_NOT_FOUND` | 404 | |
| `JOB_EXPIRED` | 410 | |
| `JOB_NOT_READY` | 400 | không ở trạng thái ký |
| `INTEGRITY_FAILED` | 400 | PDF ký không hợp lệ |
| `FILE_TOO_LARGE` | 413 | |
| `RATE_LIMITED` | 429 | |

### 2.6 Upload tài liệu (web UI)

- Đơn giản: `POST /api/v1/documents` multipart
- Resumable (file lớn): `POST /api/v1/uploads` → `PUT .../chunks/{n}` → `POST .../finish`

### 2.7 Poll UI

`GET /api/v1/jobs/{id}/status` (session user sở hữu, hoặc public id + cookie)

## 3. Schema Postgres (mới)

`users`, `sessions`, `documents`, `document_versions`, `signing_jobs`  
(+ `uploads` / `upload_chunks` cho resumable)  
`signing_jobs`: `launch_jti`, `launch_used_at`, `idempotency_key`, `complete_response_json`, `placement_json`, `verify_report_json`, `expires_at`, …

## 4. Desktop Rust

`pdfsign_app::remote::CloudJobSource` implement `RemoteJobSource`:

1. parse `pdfsign://v1/sign?t=...`
2. `GET /api/v1/health` (protocol ≥ 1)
3. handshake → access token
4. fetch job + download PDF
5. `sign_bytes` local (token SoftHSM/USB)
6. complete với `Idempotency-Key` (retry an toàn)

CLI: `pdfsign web-sign --deep-link 'pdfsign://...' --module ... --pin-stdin`

## 5. Cutover sau (cần owner OK)

Deploy staging (vd. sv14), đăng ký protocol `pdfsign://` trên Windows (HKCU), thử SoftHSM + token thật. Không mang dữ liệu app cũ.
