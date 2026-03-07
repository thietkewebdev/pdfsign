-- AlterTable
ALTER TABLE "SigningJob" ADD COLUMN "claimCodeHash" TEXT;
ALTER TABLE "SigningJob" ADD COLUMN "jobToken" TEXT;
ALTER TABLE "SigningJob" ADD COLUMN "claimedAt" TIMESTAMP(3);

-- For new jobs only: claimCodeHash and jobToken are required. Existing rows stay nullable.
-- Application creates jobs with these fields populated.