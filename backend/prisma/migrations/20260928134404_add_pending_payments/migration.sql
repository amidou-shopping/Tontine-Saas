-- CreateTable
CREATE TABLE "pending_payments" (
    "id" TEXT NOT NULL,
    "tontineId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tontineMemberId" TEXT NOT NULL,
    "provider" "PaymentProvider" NOT NULL,
    "referenceInterne" TEXT NOT NULL,
    "referenceExterne" TEXT,
    "montantBrut" DECIMAL(12,2) NOT NULL,
    "statut" TEXT NOT NULL DEFAULT 'EN_ATTENTE',
    "webhookRecu" BOOLEAN NOT NULL DEFAULT false,
    "dateWebhook" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pending_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pending_payments_referenceInterne_key" ON "pending_payments"("referenceInterne");

-- CreateIndex
CREATE INDEX "pending_payments_tontineId_userId_idx" ON "pending_payments"("tontineId", "userId");

-- CreateIndex
CREATE INDEX "pending_payments_statut_idx" ON "pending_payments"("statut");

-- AddForeignKey
ALTER TABLE "pending_payments" ADD CONSTRAINT "pending_payments_tontineId_fkey" FOREIGN KEY ("tontineId") REFERENCES "tontines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_payments" ADD CONSTRAINT "pending_payments_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pending_payments" ADD CONSTRAINT "pending_payments_tontineMemberId_fkey" FOREIGN KEY ("tontineMemberId") REFERENCES "tontine_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
