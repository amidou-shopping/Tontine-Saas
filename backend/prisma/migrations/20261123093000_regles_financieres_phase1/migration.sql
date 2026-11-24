-- Phase 1 : règles financières (commission 3 %, amende de retard 10 % après 24 h).
-- Migration additive et idempotente : aucune suppression ni reset de données.

-- 1. Nouveau type de transaction pour les amendes versées au bénéficiaire du tour.
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE e.enumlabel = 'AMENDE_RETARD'
          AND t.typname = 'TransactionType'
    ) THEN
        ALTER TYPE "TransactionType" ADD VALUE 'AMENDE_RETARD';
    END IF;
END
$$;

-- 2. Paramètres financiers globaux (singleton).
CREATE TABLE IF NOT EXISTS "parametres_plateforme" (
    "id" TEXT NOT NULL,
    "cle" TEXT NOT NULL DEFAULT 'global',
    "tauxCommission" DECIMAL(5,4) NOT NULL DEFAULT 0.03,
    "tauxAmende" DECIMAL(5,4) NOT NULL DEFAULT 0.10,
    "delaiGraceHeures" INTEGER NOT NULL DEFAULT 24,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "parametres_plateforme_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'parametres_plateforme_cle_key') THEN
        ALTER TABLE "parametres_plateforme" ADD CONSTRAINT "parametres_plateforme_cle_key" UNIQUE ("cle");
    END IF;
END
$$;

INSERT INTO "parametres_plateforme" ("id", "cle", "tauxCommission", "tauxAmende", "delaiGraceHeures")
SELECT 'parametres-global', 'global', 0.03, 0.10, 24
WHERE NOT EXISTS (SELECT 1 FROM "parametres_plateforme" WHERE "cle" = 'global');

-- 3. Uniformisation de la commission à 3 % pour les tontines existantes.
UPDATE "tontines" SET "tauxCommission" = 0.03 WHERE "tauxCommission" <> 0.03;
ALTER TABLE "tontines" ALTER COLUMN "tauxCommission" SET DEFAULT 0.03;

-- 4. Bénéficiaire d'une amende (traçabilité dans le ledger).
ALTER TABLE "transactions" ADD COLUMN IF NOT EXISTS "beneficiaireUserId" TEXT;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'transactions_beneficiaireUserId_fkey') THEN
        ALTER TABLE "transactions" ADD CONSTRAINT "transactions_beneficiaireUserId_fkey"
            FOREIGN KEY ("beneficiaireUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END
$$;

-- 5. Le cycle visé est conservé sur le paiement en attente (arriéré ou cycle courant).
ALTER TABLE "pending_payments" ADD COLUMN IF NOT EXISTS "cycleConcerne" INTEGER;

-- 6. Une seule amende par cotisation en retard.
CREATE TABLE IF NOT EXISTS "amendes_retard" (
    "id" TEXT NOT NULL,
    "tontineId" TEXT NOT NULL,
    "tontineMemberId" TEXT NOT NULL,
    "cycleConcerne" INTEGER NOT NULL,
    "montant" DECIMAL(12,2) NOT NULL,
    "beneficiaireUserId" TEXT NOT NULL,
    "transactionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "amendes_retard_pkey" PRIMARY KEY ("id")
);

DO $$
DECLARE
    contrainte TEXT;
BEGIN
    FOR contrainte IN SELECT unnest(ARRAY[
        'amendes_retard_tontineId_fkey',
        'amendes_retard_tontineMemberId_fkey',
        'amendes_retard_beneficiaireUserId_fkey',
        'amendes_retard_transactionId_fkey'
    ]) LOOP
        IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = contrainte) THEN
            IF contrainte = 'amendes_retard_tontineId_fkey' THEN
                ALTER TABLE "amendes_retard" ADD CONSTRAINT "amendes_retard_tontineId_fkey"
                    FOREIGN KEY ("tontineId") REFERENCES "tontines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
            ELSIF contrainte = 'amendes_retard_tontineMemberId_fkey' THEN
                ALTER TABLE "amendes_retard" ADD CONSTRAINT "amendes_retard_tontineMemberId_fkey"
                    FOREIGN KEY ("tontineMemberId") REFERENCES "tontine_members"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
            ELSIF contrainte = 'amendes_retard_beneficiaireUserId_fkey' THEN
                ALTER TABLE "amendes_retard" ADD CONSTRAINT "amendes_retard_beneficiaireUserId_fkey"
                    FOREIGN KEY ("beneficiaireUserId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
            ELSE
                ALTER TABLE "amendes_retard" ADD CONSTRAINT "amendes_retard_transactionId_fkey"
                    FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
            END IF;
        END IF;
    END LOOP;
END
$$;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'amendes_retard_tontineMemberId_cycleConcerne_key') THEN
        ALTER TABLE "amendes_retard" ADD CONSTRAINT "amendes_retard_tontineMemberId_cycleConcerne_key"
            UNIQUE ("tontineMemberId", "cycleConcerne");
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'amendes_retard_transactionId_key') THEN
        ALTER TABLE "amendes_retard" ADD CONSTRAINT "amendes_retard_transactionId_key" UNIQUE ("transactionId");
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "amendes_retard_tontineId_idx" ON "amendes_retard"("tontineId");
