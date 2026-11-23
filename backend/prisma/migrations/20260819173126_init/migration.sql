-- CreateEnum
CREATE TYPE "Role" AS ENUM ('SUPER_ADMIN', 'ADMIN_TONTINE', 'MEMBER');

-- CreateEnum
CREATE TYPE "TontineType" AS ENUM ('CLASSIQUE', 'INVESTISSEMENT');

-- CreateEnum
CREATE TYPE "TontineFrequency" AS ENUM ('QUOTIDIENNE', 'HEBDOMADAIRE', 'MENSUELLE');

-- CreateEnum
CREATE TYPE "TontineStatus" AS ENUM ('EN_ATTENTE', 'ACTIVE', 'SUSPENDUE', 'TERMINEE');

-- CreateEnum
CREATE TYPE "MemberStatus" AS ENUM ('ACTIF', 'EN_RETARD', 'EXCLU', 'SORTIE');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('COTISATION', 'VERSEMENT_GAGNANT', 'COMMISSION', 'ABONNEMENT', 'REMBOURSEMENT');

-- CreateEnum
CREATE TYPE "TransactionStatus" AS ENUM ('EN_ATTENTE', 'REUSSIE', 'ECHOUEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('WAVE', 'ORANGE_MONEY', 'PAYTECH', 'PAYDUNYA', 'ESPECES', 'VIREMENT');

-- CreateEnum
CREATE TYPE "PlanAbonnement" AS ENUM ('GRATUIT', 'STANDARD', 'PREMIUM');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "telephone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "prenom" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'MEMBER',
    "isBlocked" BOOLEAN NOT NULL DEFAULT false,
    "isVerified" BOOLEAN NOT NULL DEFAULT false,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "plan" "PlanAbonnement" NOT NULL DEFAULT 'GRATUIT',
    "prixMensuel" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "dateDebut" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dateFin" TIMESTAMP(3),
    "actif" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tontines" (
    "id" TEXT NOT NULL,
    "nom" TEXT NOT NULL,
    "description" TEXT,
    "type" "TontineType" NOT NULL DEFAULT 'CLASSIQUE',
    "montantCotisation" DECIMAL(12,2) NOT NULL,
    "frequence" "TontineFrequency" NOT NULL DEFAULT 'MENSUELLE',
    "tauxCommission" DECIMAL(5,4) NOT NULL DEFAULT 0.015,
    "nombreMaxMembres" INTEGER NOT NULL,
    "statut" "TontineStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "dateDebut" TIMESTAMP(3),
    "cycleActuel" INTEGER NOT NULL DEFAULT 1,
    "createurId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tontines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tontine_members" (
    "id" TEXT NOT NULL,
    "tontineId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "ordrePassage" INTEGER NOT NULL,
    "statut" "MemberStatus" NOT NULL DEFAULT 'ACTIF',
    "aDejaRecu" BOOLEAN NOT NULL DEFAULT false,
    "dateReception" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tontine_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "transactions" (
    "id" TEXT NOT NULL,
    "type" "TransactionType" NOT NULL,
    "statut" "TransactionStatus" NOT NULL DEFAULT 'EN_ATTENTE',
    "provider" "PaymentProvider",
    "referenceExterne" TEXT,
    "montantBrut" DECIMAL(12,2) NOT NULL,
    "montantCommission" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "montantNet" DECIMAL(12,2) NOT NULL,
    "userId" TEXT NOT NULL,
    "tontineId" TEXT,
    "tontineMemberId" TEXT,
    "cycleConcerne" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "cible" TEXT NOT NULL,
    "details" TEXT,
    "acteurId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "users_telephone_key" ON "users"("telephone");

-- CreateIndex
CREATE INDEX "users_role_idx" ON "users"("role");

-- CreateIndex
CREATE UNIQUE INDEX "subscriptions_userId_key" ON "subscriptions"("userId");

-- CreateIndex
CREATE INDEX "tontines_statut_idx" ON "tontines"("statut");

-- CreateIndex
CREATE UNIQUE INDEX "tontine_members_tontineId_userId_key" ON "tontine_members"("tontineId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "tontine_members_tontineId_ordrePassage_key" ON "tontine_members"("tontineId", "ordrePassage");

-- CreateIndex
CREATE INDEX "transactions_type_statut_idx" ON "transactions"("type", "statut");

-- CreateIndex
CREATE INDEX "transactions_tontineId_idx" ON "transactions"("tontineId");

-- CreateIndex
CREATE INDEX "audit_logs_acteurId_idx" ON "audit_logs"("acteurId");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tontines" ADD CONSTRAINT "tontines_createurId_fkey" FOREIGN KEY ("createurId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tontine_members" ADD CONSTRAINT "tontine_members_tontineId_fkey" FOREIGN KEY ("tontineId") REFERENCES "tontines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tontine_members" ADD CONSTRAINT "tontine_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tontineId_fkey" FOREIGN KEY ("tontineId") REFERENCES "tontines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_tontineMemberId_fkey" FOREIGN KEY ("tontineMemberId") REFERENCES "tontine_members"("id") ON DELETE SET NULL ON UPDATE CASCADE;
