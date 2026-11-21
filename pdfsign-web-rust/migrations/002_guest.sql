-- Guest signing: session cookie + fingerprint, 2 completed signatures free.

CREATE TABLE IF NOT EXISTS guest_sessions (
  id                TEXT PRIMARY KEY,
  guest_token       TEXT NOT NULL UNIQUE,
  fingerprint_hash  TEXT,
  ip_hash           TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at        TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_guest_token ON guest_sessions(guest_token);
CREATE INDEX IF NOT EXISTS idx_guest_fp ON guest_sessions(fingerprint_hash);

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS guest_id TEXT REFERENCES guest_sessions(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_documents_guest ON documents(guest_id);

CREATE TABLE IF NOT EXISTS guest_completions (
  id                TEXT PRIMARY KEY,
  guest_id          TEXT REFERENCES guest_sessions(id) ON DELETE SET NULL,
  fingerprint_hash  TEXT,
  ip_hash           TEXT,
  job_id            TEXT NOT NULL UNIQUE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_guest_completions_guest ON guest_completions(guest_id);
CREATE INDEX IF NOT EXISTS idx_guest_completions_fp ON guest_completions(fingerprint_hash);
