-- Fresh PDFSign web schema (protocol v1). No legacy WPF/claim-code columns.

CREATE TABLE IF NOT EXISTS users (
  id              TEXT PRIMARY KEY,
  email           TEXT NOT NULL UNIQUE,
  name            TEXT,
  password_hash   TEXT NOT NULL,
  role            TEXT NOT NULL DEFAULT 'USER',
  plan            TEXT NOT NULL DEFAULT 'free',
  is_disabled     BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  id            TEXT PRIMARY KEY,
  session_token TEXT NOT NULL UNIQUE,
  user_id       TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_sessions_token ON sessions(session_token);

CREATE TABLE IF NOT EXISTS documents (
  id         TEXT PRIMARY KEY,
  public_id  TEXT NOT NULL UNIQUE,
  title      TEXT,
  status     TEXT NOT NULL DEFAULT 'ACTIVE',
  user_id    TEXT REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id);

CREATE TABLE IF NOT EXISTS document_versions (
  id              TEXT PRIMARY KEY,
  document_id     TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  version         INT NOT NULL,
  storage_key     TEXT NOT NULL,
  storage_driver  TEXT NOT NULL DEFAULT 'local',
  size_bytes      INT NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (document_id, version)
);

CREATE TABLE IF NOT EXISTS uploads (
  id           TEXT PRIMARY KEY,
  user_id      TEXT REFERENCES users(id) ON DELETE SET NULL,
  title        TEXT,
  total_bytes  BIGINT,
  chunk_size   INT NOT NULL DEFAULT 1048576,
  received     BIGINT NOT NULL DEFAULT 0,
  storage_key  TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'open',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at   TIMESTAMPTZ NOT NULL
);

CREATE TABLE IF NOT EXISTS signing_jobs (
  id                    TEXT PRIMARY KEY,
  document_version_id   TEXT NOT NULL REFERENCES document_versions(id) ON DELETE CASCADE,
  document_id           TEXT NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  status                TEXT NOT NULL DEFAULT 'READY',
  placement_json        TEXT NOT NULL,
  template_id           TEXT,
  seal_image_key        TEXT,
  launch_jti            TEXT NOT NULL UNIQUE,
  launch_used_at        TIMESTAMPTZ,
  idempotency_key       TEXT NOT NULL UNIQUE,
  complete_response_json TEXT,
  cert_meta_json        TEXT,
  verify_report_json    TEXT,
  output_version_id     TEXT REFERENCES document_versions(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at          TIMESTAMPTZ,
  expires_at            TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_jobs_document ON signing_jobs(document_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON signing_jobs(status);
