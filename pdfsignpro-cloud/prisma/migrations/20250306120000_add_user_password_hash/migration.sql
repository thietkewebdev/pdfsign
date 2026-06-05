-- AlterTable (guarded)
-- On a fresh database the "User" table does not exist yet at this point — it is
-- created later by 20250315100000_add_auth_models. Skip safely in that case; the
-- column is (re)added idempotently by 20260306000100_add_user_password_hash.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'User'
  ) THEN
    ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "passwordHash" TEXT;
  END IF;
END $$;
