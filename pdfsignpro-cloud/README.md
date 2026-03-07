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
  "jobToken": "<raw_token>",
  "deepLink": "pdfsignpro://sign?jobId=job_abc123&token=...&apiBaseUrl=...",
  "placement": { "page": "LAST", "rectPct": { ... } },
  "documentId": "clxx...",
  "expiresAt": "2025-03-07T12:30:00.000Z"
}
```

### Get job (auth with x-job-token)

```bash
curl http://localhost:3000/api/jobs/job_abc123 \
  -H "x-job-token: <token_from_deep_link>"
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

### Complete job (upload signed PDF)

```bash
curl -X POST http://localhost:3000/api/jobs/job_abc123/complete \
  -H "x-job-token: <token_from_deep_link>" \
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

## Architecture

- **Documents** – stored in R2 (or local `.storage/` when `STORAGE_DRIVER=local`)
- **Signing jobs** – `jobToken` is never stored; only `jobTokenHash` (SHA-256) is persisted
- **Presigned URLs** – used for secure, time-limited access to PDFs
