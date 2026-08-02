# AGENTS.md

## Cursor Cloud specific instructions

This repo is a **monorepo with three products** that make up the PDFSignPro digital PDF
signing platform:

- `pdfsignpro-cloud/` — **the core web app + REST API** (Next.js 16 / React 19 / Prisma /
  PostgreSQL). This is the only product that runs in the Linux cloud environment and is where
  virtually all development happens.
- `desktop-signer/` — Windows desktop signer (Python / PySide6). Real signing needs Windows +
  a USB PKCS#11 token, so only its unit tests are portable to Linux.
- `pdfsignpro-signer-wpf/` — alternative Windows desktop signer (C# / .NET 8 / WPF). Requires
  the .NET SDK and Windows; not runnable in this Linux environment.

The setup script (`npm install` in `pdfsignpro-cloud`) is handled automatically on VM startup.
The notes below cover the non-obvious things that script does **not** do.

### PostgreSQL (required for the cloud app, not started automatically)

The cloud app needs PostgreSQL. It is installed at the system level but the service is **not**
started automatically — start it at the beginning of a session:

```bash
sudo pg_ctlcluster 16 main start
```

The dev database/role usually persist across sessions. If the `pdfsign` role or `pdfsignpro`
database is missing (e.g. a fresh VM), recreate it:

```bash
sudo -u postgres psql -c "CREATE ROLE pdfsign LOGIN PASSWORD 'pdfsign' CREATEDB;"
sudo -u postgres psql -c "CREATE DATABASE pdfsignpro OWNER pdfsign;"
```

Then apply migrations (run from `pdfsignpro-cloud/`): `npx prisma migrate deploy`.

### pdfsignpro-cloud — env, run, test

- **`.env` is required and git-ignored.** It should already exist on disk. If missing, create
  `pdfsignpro-cloud/.env` with at least: `DATABASE_URL="postgresql://pdfsign:pdfsign@localhost:5432/pdfsignpro?schema=public"`,
  `STORAGE_DRIVER="local"` (stores uploads under `.storage/uploads/` — no R2/S3 needed for dev),
  `NEXTAUTH_URL="http://localhost:3000"`, and an `AUTH_SECRET` (e.g. `openssl rand -base64 32`).
  All third-party integrations (R2, Resend email, SePay payments, Google OAuth, Telegram) are
  optional and disabled when their vars are unset.
- Standard scripts live in `pdfsignpro-cloud/package.json`: `npm run dev` (dev server on
  :3000, uses `next dev --webpack`), `npm run lint`, `npm run build`, `npm start`,
  `npm run db:migrate`. `npm run lint` reports some pre-existing errors/warnings in the repo —
  that is expected, not a setup problem.

### KEY GOTCHA: PDF viewer pages 500 under `next dev`

The PDF viewer pages (`/d/[publicId]`, `/sign/[id]`, `/contract/[id]`) return **HTTP 500 in
dev mode**. `src/components/pdf/PdfViewer.tsx` imports `pdfjs-dist` at module top level, so it
executes during Next.js SSR where browser globals are absent (`ReferenceError: DOMMatrix is not
defined` under Turbopack, `Object.defineProperty called on non-object` under webpack). This
reproduces under **both** `next dev --webpack` and default Turbopack dev. The homepage, auth,
dashboard, and **all `/api/*` routes work fine in dev**; only the pdf.js viewer pages are
affected, and they render correctly in a production build (`npm run build && npm start`).

Because of this, the signing flow is best exercised/tested end-to-end through the **API**
(documented in `pdfsignpro-cloud/README.md`): `POST /api/documents` → `POST /api/jobs` →
`POST /api/jobs/:id/claim` → `GET /api/jobs/:id` → `POST /api/jobs/:id/complete` →
`GET /api/jobs/:id/status`. Do not treat the dev-mode viewer 500 as an environment/setup
failure — it is a pre-existing app-code issue.

### desktop-signer (Python) — tests only on Linux

Real signing is Windows + USB-token only. The portable unit tests run on Linux via a venv:

```bash
cd desktop-signer
python3 -m venv .venv            # one-time; python3.12-venv is installed
.venv/bin/pip install -r requirements.txt
.venv/bin/pip install pytest
.venv/bin/python -m pytest tests/ -v
```
