-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractSigner" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "token" TEXT NOT NULL,
    "placementJson" TEXT NOT NULL,
    "templateId" TEXT NOT NULL DEFAULT 'classic',
    "signingJobId" TEXT,
    "invitedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "ContractSigner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Contract_userId_idx" ON "Contract"("userId");

-- CreateIndex
CREATE INDEX "Contract_documentId_idx" ON "Contract"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "ContractSigner_token_key" ON "ContractSigner"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ContractSigner_signingJobId_key" ON "ContractSigner"("signingJobId");

-- CreateIndex
CREATE INDEX "ContractSigner_token_idx" ON "ContractSigner"("token");

-- CreateIndex
CREATE UNIQUE INDEX "ContractSigner_contractId_order_key" ON "ContractSigner"("contractId", "order");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSigner" ADD CONSTRAINT "ContractSigner_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "Contract"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractSigner" ADD CONSTRAINT "ContractSigner_signingJobId_fkey" FOREIGN KEY ("signingJobId") REFERENCES "SigningJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;
