-- AlterTable
ALTER TABLE "Document" ALTER COLUMN "title" DROP NOT NULL;

-- AlterTable
ALTER TABLE "SigningJob" ADD COLUMN "certMetaJson" TEXT;
ALTER TABLE "SigningJob" ADD COLUMN "expiresAt" TIMESTAMP(3);
UPDATE "SigningJob" SET "expiresAt" = "createdAt" + INTERVAL '30 minutes' WHERE "expiresAt" IS NULL;
ALTER TABLE "SigningJob" ALTER COLUMN "expiresAt" SET NOT NULL;
ALTER TABLE "SigningJob" ALTER COLUMN "status" SET DEFAULT 'CREATED';
