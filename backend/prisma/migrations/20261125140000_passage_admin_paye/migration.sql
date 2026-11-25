-- Point 3 : passage MEMBER -> ADMIN_TONTINE payant et configurable.
-- Additif et sans reset : les paiements existants restent des COTISATION.

-- Nouveau type de transaction (ajout idempotent à l'enum).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_enum e
        JOIN pg_type t ON t.oid = e.enumtypid
        WHERE e.enumlabel = 'PASSAGE_ADMIN'
          AND t.typname = 'TransactionType'
    ) THEN
        ALTER TYPE "TransactionType" ADD VALUE 'PASSAGE_ADMIN';
    END IF;
END
$$;

-- Frais unique de passage Admin (défaut 1000 FCFA, surchargeable par .env).
ALTER TABLE "parametres_plateforme"
    ADD COLUMN IF NOT EXISTS "fraisPassageAdminFcfa" INTEGER NOT NULL DEFAULT 1000;

-- Un PendingPayment peut désormais être une cotisation ou un passage Admin
-- (sans tontine ni membre de tontine dans ce second cas).
ALTER TABLE "pending_payments"
    ADD COLUMN IF NOT EXISTS "type" TEXT NOT NULL DEFAULT 'COTISATION',
    ALTER COLUMN "tontineId" DROP NOT NULL,
    ALTER COLUMN "tontineMemberId" DROP NOT NULL;

CREATE INDEX IF NOT EXISTS "pending_payments_type_statut_idx"
    ON "pending_payments"("type", "statut");
