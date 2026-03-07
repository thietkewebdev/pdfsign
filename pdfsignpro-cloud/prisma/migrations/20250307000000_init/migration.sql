-- CreateTable
CREATE TABLE "Document" (
    "id" TEXT NOT NULL,
    "publicId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DocumentVersion" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "storageKey" TEXT NOT NULL,
    "storageDriver" TEXT NOT NULL DEFAULT 'r2',
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SigningJob" (
    "id" TEXT NOT NULL,
    "documentVersionId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "jobTokenHash" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "placementJson" TEXT NOT NULL,
    "outputVersionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "SigningJob_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Document_publicId_key" ON "Document"("publicId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentVersion_documentId_version_key" ON "DocumentVersion"("documentId", "version");

-- CreateIndex
CREATE INDEX "DocumentVersion_documentId_idx" ON "DocumentVersion"("documentId");

-- CreateIndex
CREATE INDEX "SigningJob_documentVersionId_idx" ON "SigningJob"("documentVersionId");

-- CreateIndex
CREATE INDEX "SigningJob_documentId_idx" ON "SigningJob"("documentId");

-- CreateIndex
CREATE INDEX "SigningJob_jobTokenHash_idx" ON "SigningJob"("jobTokenHash");

-- AddForeignKey
ALTER TABLE "DocumentVersion" ADD CONSTRAINT "DocumentVersion_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningJob" ADD CONSTRAINT "SigningJob_documentVersionId_fkey" FOREIGN KEY ("documentVersionId") REFERENCES "DocumentVersion"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningJob" ADD CONSTRAINT "SigningJob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SigningJob" ADD CONSTRAINT "SigningJob_outputVersionId_fkey" FOREIGN KEY ("outputVersionId") REFERENCES "DocumentVersion"("id") ON DELETE SET NULL ON UPDATE CASCADE;
