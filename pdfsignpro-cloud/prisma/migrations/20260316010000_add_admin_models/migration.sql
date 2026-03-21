-- AlterTable (idempotent)
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "isDisabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "plan" TEXT NOT NULL DEFAULT 'free';
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "role" TEXT NOT NULL DEFAULT 'USER';

-- CreateTable
CREATE TABLE IF NOT EXISTS "AdminAuditLog" (
    "id" TEXT NOT NULL,
    "actorUserId" TEXT,
    "action" TEXT NOT NULL,
    "resource" TEXT NOT NULL,
    "resourceId" TEXT,
    "detail" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AdminAnalyticsEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "path" TEXT,
    "method" TEXT,
    "actorUserId" TEXT,
    "subjectUserId" TEXT,
    "metadataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AdminAnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AdminAuditLog_actorUserId_idx" ON "AdminAuditLog"("actorUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AdminAuditLog_resource_action_idx" ON "AdminAuditLog"("resource", "action");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AdminAuditLog_createdAt_idx" ON "AdminAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AdminAnalyticsEvent_eventType_idx" ON "AdminAnalyticsEvent"("eventType");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AdminAnalyticsEvent_actorUserId_idx" ON "AdminAnalyticsEvent"("actorUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AdminAnalyticsEvent_subjectUserId_idx" ON "AdminAnalyticsEvent"("subjectUserId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AdminAnalyticsEvent_createdAt_idx" ON "AdminAnalyticsEvent"("createdAt");

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AdminAuditLog_actorUserId_fkey'
  ) THEN
    ALTER TABLE "AdminAuditLog"
      ADD CONSTRAINT "AdminAuditLog_actorUserId_fkey"
      FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AdminAnalyticsEvent_actorUserId_fkey'
  ) THEN
    ALTER TABLE "AdminAnalyticsEvent"
      ADD CONSTRAINT "AdminAnalyticsEvent_actorUserId_fkey"
      FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- AddForeignKey
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'AdminAnalyticsEvent_subjectUserId_fkey'
  ) THEN
    ALTER TABLE "AdminAnalyticsEvent"
      ADD CONSTRAINT "AdminAnalyticsEvent_subjectUserId_fkey"
      FOREIGN KEY ("subjectUserId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;
