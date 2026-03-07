# PDFSignPro Cloud

Upload PDF. Route signers. Done.

## Local development

### Prerequisites

- Node.js 20+
- PostgreSQL
- (Optional) Cloudflare R2 for production storage

### Setup

1. **Install dependencies**

   ```bash
   npm install
   ```

2. **Configure environment**

   ```bash
   cp .env.example .env
   ```

   Edit `.env` and set at least:

   - `DATABASE_URL` – PostgreSQL connection string, e.g. `postgresql://user:password@localhost:5432/pdfsignpro`
   - `STORAGE_DRIVER=local` – for local dev without R2 (files stored in `.storage/uploads/`)

   For R2 in production:

   - `R2_ENDPOINT` (or `R2_ACCOUNT_ID`), `R2_BUCKET`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`
   - `STORAGE_DRIVER=r2`

3. **Run migrations**

   ```bash
   npx prisma migrate dev
   ```

4. **Start dev server**

   ```bash
   npm run dev
   ```

   Open [http://localhost:3000](http://localhost:3000).

## Database

### Migrate

```bash
npx prisma migrate dev --name <migration_name>
```

### Generate Prisma client

```bash
npx prisma generate
```

## API examples (curl)

### Upload document (multipart)

```bash
curl -X POST http://localhost:3000/api/documents \
  -F "file=@/path/to/document.pdf" \
  -F "title=Contract 2024"
```

Response:

```json
{
  "documentId": "clxx...",
  "publicId": "abc123xyz",
  "publicUrl": "https://.../d/abc123xyz",
  "title": "Contract 2024",
  "version": 1
}
```

### Get document (presigned URL)

```bash
curl http://localhost:3000/api/documents/abc123xyz
```

### Create signing job

```bash
curl -X POST http://localhost:3000/api/jobs \
  -H "Content-Type: application/json" \
  -d '{
    "documentId": "clxx...",
    "placement": {
      "page": "LAST",
      "rectPct": { "x": 0.64, "y": 0.86, "w": 0.32, "h": 0.1 }
    }
  }'
```

Response:

```json
{
  "jobId": "job_abc123",
  "deepLink": "pdfsignpro://sign?p=eyJqIjoiam9iX2FiYzEyMyIsImMiOiJhMWIyYzNkNCIsImgiOiJteWFwcC5vbnJlbmRlci5jb20ifQ",
  "placement": { "page": "LAST", "rectPct": { ... } },
  "documentId": "clxx...",
  "expiresAt": "2025-03-07T12:30:00.000Z"
}
```

The deep link uses a single `p` param (base64url-encoded JSON: `{j:jobId,c:code,h:hostname}`) so Windows can launch it reliably. The signer app decodes `p`, claims the job with the code, and obtains the token.

### Claim job (exchange code for token)

```bash
curl -X POST http://localhost:3000/api/jobs/job_abc123/claim \
  -H "Content-Type: application/json" \
  -d '{"code":"a1b2c3d4"}'
```

Response:

```json
{
  "jobToken": "<raw_token>",
  "apiBaseUrl": "https://myapp.onrender.com"
}
```

Use `jobToken` in `x-job-token` for subsequent requests. Use `apiBaseUrl` as the base for API calls.

### Get job (auth with x-job-token)

```bash
curl http://localhost:3000/api/jobs/job_abc123 \
  -H "x-job-token: <token_from_claim_response>"
```

Response:

```json
{
  "document": { "title": "Contract 2024", "publicId": "abc123xyz" },
  "inputPdfUrl": "https://...",
  "placement": { "page": "LAST", "rectPct": { "x": 0.64, "y": 0.86, "w": 0.32, "h": 0.1 } },
  "status": "CREATED"
}
```

### Get job status (public, no auth)

```bash
curl http://localhost:3000/api/jobs/job_abc123/status
```

Response:

```json
{
  "status": "COMPLETED",
  "expiresAt": "2025-03-07T12:30:00.000Z",
  "completedAt": "2025-03-07T12:15:00.000Z",
  "outputVersionId": "clxx...",
  "signedDownloadUrl": "https://...presigned..."
}
```

When `status === "COMPLETED"`, `signedDownloadUrl` is a presigned URL to the signed PDF.

### Complete job (upload signed PDF)

```bash
curl -X POST http://localhost:3000/api/jobs/job_abc123/complete \
  -H "x-job-token: <token_from_claim_response>" \
  -F "file=@/path/to/signed.pdf" \
  -F 'certMeta={"subject":"CN=...","serial":"...","signingTime":"..."}'
```

Response:

```json
{
  "signedPublicUrl": "https://.../d/abc123xyz",
  "versionNumber": 2,
  "jobId": "job_abc123",
  "documentId": "clxx...",
  "publicId": "abc123xyz"
}
```

## Signer download

`/api/signer/download` redirects to a presigned R2 URL for `PDFSignProSigner.exe`.

**Upload the exe to R2:**

1. Build: `cd desktop-signer && .\build.ps1` → outputs `dist/PDFSignProSigner.exe`
2. Upload to R2 at key `signer/PDFSignProSigner.exe` (or set `SIGNER_R2_KEY` to your key)
3. Use Cloudflare Dashboard, AWS CLI, or any S3-compatible tool:

   ```bash
   aws s3 cp desktop-signer/dist/PDFSignProSigner.exe s3://YOUR_BUCKET/signer/PDFSignProSigner.exe \
     --endpoint-url https://YOUR_ACCOUNT.r2.cloudflarestorage.com
   ```

If the file is missing, the API returns 404 with a hint.

## How signing works

1. **Upload** – User uploads a PDF and is redirected to `/d/[publicId]`.
2. **Place** – On the document page, user adds a signature box (drag to position) and clicks **Ký số**.
3. **Create job** – Frontend calls `POST /api/jobs` with `documentId` and `placement`. Backend creates a `SigningJob` and returns `jobId`, `deepLink` (`pdfsignpro://sign?p=<base64url>`), `expiresAt`.
4. **Deep link** – User clicks **Mở PDFSignPro Signer** (or copies the deep link). The `pdfsignpro://sign?p=...` URL opens the desktop app. The app decodes `p`, calls `POST /api/jobs/:jobId/claim` with the code to obtain `jobToken` and `apiBaseUrl`, then fetches the job and signs.
5. **Desktop app** – Signer fetches job via `GET /api/jobs/:jobId` (with `x-job-token`), downloads the PDF, signs it with USB token, and uploads via `POST /api/jobs/:jobId/complete`.
6. **Polling** – Frontend polls `GET /api/jobs/:jobId/status` every 2 seconds (public, no auth). When `status === "COMPLETED"`, it receives `signedDownloadUrl` (presigned URL to the signed PDF).
7. **Done** – Viewer refreshes to show the signed PDF. User sees **Tải PDF đã ký** to download.

**Error handling:**

- **Expired** – Job expires after 30 minutes. User sees "Job hết hạn, tạo lại".
- **Timeout** – Polling stops after 5 minutes. User sees "Hết thời gian chờ (5 phút)".
- **CREATED too long** – After ~60 seconds without completion, hint: "Chưa thấy app ký – kiểm tra đã cài Signer chưa".

## Architecture

- **Documents** – stored in R2 (or local `.storage/` when `STORAGE_DRIVER=local`)
- **Signing jobs** – `jobToken` is never stored; only `jobTokenHash` (SHA-256) is persisted
- **Presigned URLs** – used for secure, time-limited access to PDFs
