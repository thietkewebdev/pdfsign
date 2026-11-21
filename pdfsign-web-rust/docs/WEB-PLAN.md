# Kế hoạch PDFSign Web (Rust)

Tài liệu này mô tả app web hiện tại (`pdfsignpro-cloud/`, Next.js + Prisma) và kế hoạch viết lại bằng Rust (Axum + SQLx PostgreSQL) + React (Vite). Thư mục mới: `pdfsign-web-rust/`. Không đụng `pdfsignpro-cloud/`, Railway, hay production trong giai đoạn này.

## 1. Khoảng mục tiêu Phase 2 (skeleton này)

- Auth email + mật khẩu (argon2), cookie phiên
- Upload PDF, danh sách tài liệu, đặt ô chữ ký (pdf.js)
- Tạo job ký + claim code + deep link `pdfsignpro://`
- API job tương thích WPF và desktop Rust
- Complete: xác minh PAdES bằng `pdfsign-core`, tùy chọn nâng B-LT/B-LTA phía server
- UI brand đỏ như desktop (`#E11D48`, sidebar `#0F172A`)
- docker-compose Postgres, e2e SoftHSM, CI path-filter

Chưa làm trong skeleton: hợp đồng nhiều bên, thanh toán SePay, admin đầy đủ, marketing/blog, email verify production.

## 2. Inventory web hiện tại (`pdfsignpro-cloud/`)

### 2.1 Trang (App Router)

| Đường dẫn | Vai trò |
|---|---|
| `/` | Landing marketing |
| `/login`, `/register` | Đăng nhập / đăng ký (NextAuth credentials + OAuth Account) |
| `/dashboard` | Tài liệu của user, quota, nâng cấp gói |
| `/d/[publicId]` | Xem PDF, đặt ô chữ ký, tạo job, mở signer, tải bản đã ký |
| `/sign/[id]`, `/sign-pdf` | Luồng ký / ký PDF thay thế |
| `/contract/create`, `/contract/[id]` | Hợp đồng nhiều bên + mời email |
| `/signer`, `/offline` | Tải signer, hướng dẫn offline |
| `/admin` | Admin: users, docs, usage, plans, storage, contracts |
| `/faq`, `/blog`, `/privacy`, `/terms` | Nội dung tĩnh / SEO |

### 2.2 Auth và user

- NextAuth: session JWT/DB, model `User` (email, `passwordHash`, `plan`, `planExpiresAt`, `role`, `isDisabled`)
- `Account`, `Session` (OAuth)
- `EmailVerificationToken` + API verify / resend
- Gói: `free` / `pro` / `premium` (xem `src/lib/plans.ts`), quota ký/tháng; guest theo IP (`ANON_MONTHLY_LIMIT = 3`)

### 2.3 Tài liệu và storage

- `Document` + `DocumentVersion` (version tăng dần)
- Storage R2 hoặc local `.storage/` (`STORAGE_DRIVER`)
- Upload `POST /api/documents` multipart `file` (+ `title`)
- File: `GET /api/documents/[publicId]/file`, download, metadata

### 2.4 Job ký (trái tim tương thích)

- `SigningJob`: status `CREATED|COMPLETED|EXPIRED|CANCELED`, hết hạn **90 phút**
- Claim code 8 hex (SHA-256 lưu DB), job token 48 hex (hash + raw để claim)
- Placement JSON: `{ page: number|"LAST", rectPct: {x,y,w,h} }` tỉ lệ 0..1, gốc dưới-trái trang **hiển thị** (đã xoay)
- Deep link: `pdfsignpro://sign?p=<base64url {j,c,h,t?}>`
- Seal image tùy template `seal`

### 2.5 Hợp đồng

- `Contract`, `ContractSigner`, `ContractEvent`
- Mời lần lượt, mỗi signer gắn một `SigningJob`
- Email mời / hoàn tất (`src/lib/email.ts`)

### 2.6 Billing

- `Payment` qua SePay webhook, mã chuyển khoản, nâng `plan`

### 2.7 Admin / analytics

- `AdminAuditLog`, `AdminAnalyticsEvent`
- API `/api/admin/*`: overview, users, documents, usage, plans, storage, contracts

### 2.8 Signer auto-update

- File: `pdfsignpro-signer-wpf/signer-manifest.json` trên GitHub `main`
- WPF đọc URL raw; API `/api/signer/download` redirect R2 Setup
- Rust web phải tiếp tục phục vụ (hoặc proxy) manifest + download để WPF không gãy

## 3. Ánh xạ Prisma → Postgres mới

Giữ tên cột gần Prisma để migration dễ; dùng UUID/text id tương thích (`job_*`, cuid hoặc hex).

| Prisma | Bảng mới (skeleton) | Ghi chú |
|---|---|---|
| User | `users` | `password_hash` argon2; bỏ NextAuth Account nếu chưa cần OAuth |
| Session | `sessions` | cookie `session_token` |
| EmailVerificationToken | (sau) | Phase sau |
| Document | `documents` | `public_id` unique |
| DocumentVersion | `document_versions` | `storage_key`, `size_bytes` |
| SigningJob | `signing_jobs` | token hash + raw claim; `placement_json`; `expires_at` |
| Contract* | (sau) | Giữ trong plan cutover |
| Payment | (sau) | |
| Admin* | (sau) | |

Storage: driver `local` (thư mục) trước; R2/S3 sau (cùng `storage_key`).

## 4. API bắt buộc tương thích (WPF + Rust desktop)

Không đổi path/shape dưới đây. Field thêm được, field cũ không được đổi nghĩa.

### 4.1 Deep link

`pdfsignpro://sign?p=<base64url(JSON)>`

JSON:

```json
{ "j": "job_...", "c": "a1b2c3d4", "h": "hostname.or.localhost", "t": "valid" }
```

- `h=localhost` → client dùng `http://localhost:3000` (WPF). Skeleton mặc định port **8080** nhưng e2e/dev có thể map `APP_PUBLIC_HOST` / `APP_URL` cho khớp. Khi cutover production giữ hostname thật như hiện tại.
- `t` optional (template id).

### 4.2 Tạo job (web UI)

`POST /api/jobs` JSON:

```json
{
  "documentId": "<id hoặc publicId>",
  "templateId": "valid",
  "sealImage": "data:image/png;base64,...",
  "placement": { "page": "LAST", "rectPct": { "x": 0.64, "y": 0.06, "w": 0.32, "h": 0.1 } }
}
```

Cũng chấp nhận `xPct/yPct/wPct/hPct`. Response:

```json
{
  "jobId": "job_...",
  "deepLink": "pdfsignpro://sign?p=...",
  "placement": { "page": "LAST", "rectPct": { ... } },
  "documentId": "...",
  "expiresAt": "ISO-8601"
}
```

Hết hạn: **90 phút** (`SIGNING_JOB_EXPIRES_MINUTES=90`).

### 4.3 Claim

`POST /api/jobs/{jobId}/claim` `{ "code": "..." }` → `{ "jobToken", "apiBaseUrl" }`

Lỗi: `JOB_NOT_FOUND` 404, `JOB_NOT_AVAILABLE` 400, `JOB_EXPIRED` 410, `CLAIM_ALREADY_USED` 409, `INVALID_CLAIM_CODE` 401, `RATE_LIMITED` 429.

Claim code: 6–10 hex, so sánh SHA-256, **một lần**.

### 4.4 Lấy job

`GET /api/jobs/{jobId}` header `x-job-token`:

```json
{
  "document": { "title": "...", "publicId": "..." },
  "inputPdfUrl": "http(s)://.../...",
  "sealImageUrl": "...",
  "placement": { "page": 1, "rectPct": { "x", "y", "w", "h" } },
  "status": "CREATED"
}
```

`inputPdfUrl` phải tải được không cần cookie (URL có chữ ký ngắn hạn hoặc token query).

### 4.5 Complete

`POST /api/jobs/{jobId}/complete` header `x-job-token`, multipart:

- `file` hoặc `signedPdf`: `application/pdf`, tối đa **25 MB**
- `certMeta`: JSON string `{subjectO, subjectCN, issuerCN, serial, signingTime}`

Response: `{ signedPublicUrl, signedDownloadUrl, publicId, versionNumber }`

**Nâng cấp server (mới):** trước khi lưu, gọi `pdfsign_core::verify_pdf`:

- `digest_ok`, `signature_ok`, `covers_whole_file` (byte range)
- So khớp cert (serial/CN) với `certMeta` nếu có
- Tùy `SERVER_UPGRADE_LEVEL=B-LT|B-LTA`: thêm DSS / document timestamp (private key vẫn chỉ trên token client)

### 4.6 Status (public)

`GET /api/jobs/{jobId}/status` → `{ status, expiresAt, completedAt, outputVersionId, signedDownloadUrl, ... }`

### 4.7 Manifest

- Tiếp tục publish `signer-manifest.json` (WPF) trên repo
- API mới có thể mirror: `GET /api/signer/manifest` + `GET /api/signer/download`

## 5. Placement và trang xoay

- UI (pdf.js) đặt ô trên trang đã `/Rotate`
- `rectPct` là tỉ lệ trang **hiển thị**, gốc dưới-trái (giống cloud + `pdfsign-core::RectPct`)
- Core map sang user space khi ký; server gửi đúng placement trong job, không đổi hệ tọa độ
- Khi server verify / nâng cấp LTV: không dịch chuyển appearance đã nhúng

## 6. Migration dữ liệu (không chạy production)

1. Export read-only từ DB cũ (script `scripts/migrate-export.sh`): `pg_dump --data-only` hoặc COPY CSV các bảng User, Document, DocumentVersion, SigningJob, …
2. Đổi hash mật khẩu nếu thuật toán khác (NextAuth salt.hash → argon2: cần reset mật khẩu hoặc converter có kiểm thử)
3. Import vào DB mới bằng `scripts/migrate-import.sh` trên bản copy
4. Copy object storage (R2 → bucket mới hoặc local) giữ nguyên `storage_key`
5. So khớp số job/document; thử claim một job CREATED còn hạn trên staging

**Cấm** trỏ script vào DB production. Chỉ bản snapshot / staging.

## 7. Cutover (sau, cần owner OK)

1. Staging trên máy/VPS (ví dụ sv14) song song cloud hiện tại
2. Chạy e2e SoftHSM + thử WPF thật + Rust desktop với deep link staging
3. DNS / reverse proxy chuyển dần; giữ hostname trong deep link `h` khớp TLS
4. Rollback: DNS về Next.js cũ; DB cũ không bị ghi bởi app mới nếu chỉ đọc snapshot

## 8. Bảo mật

- Private key **không bao giờ** lên server
- Job token chỉ qua `x-job-token`; lưu hash; raw chỉ để claim
- Cookie session HttpOnly; Secure khi HTTPS
- Giới hạn upload 25 MB; rate limit claim/create job

## 9. Chạy local (skeleton)

Xem `README.md` trong `pdfsign-web-rust/`: docker-compose Postgres, `cargo run`, `npm run dev` cho UI, `scripts/e2e-web-job.sh` cho SoftHSM.
