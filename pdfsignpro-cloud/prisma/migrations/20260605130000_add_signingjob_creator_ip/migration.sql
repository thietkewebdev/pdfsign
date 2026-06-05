-- AlterTable (idempotent)
ALTER TABLE "SigningJob" ADD COLUMN IF NOT EXISTS "creatorIpHash" TEXT;

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SigningJob_creatorIpHash_idx" ON "SigningJob"("creatorIpHash");
