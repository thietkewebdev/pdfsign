-- File retention + plan quota tracking

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS purged_at TIMESTAMPTZ;

UPDATE documents
SET expires_at = created_at + INTERVAL '48 hours'
WHERE expires_at IS NULL AND status = 'ACTIVE';

CREATE INDEX IF NOT EXISTS idx_documents_expires
  ON documents (expires_at)
  WHERE status = 'ACTIVE' AND purged_at IS NULL;

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS plan_period TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS trial_files_used INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS quota_period_start TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS quota_used INT NOT NULL DEFAULT 0;

-- Default free accounts keep plan='free'; paid plans: personal | business | unlimited
UPDATE users SET plan = 'free' WHERE plan IS NULL OR plan = '';
