-- Phase 3 : gouvernance des rôles et des adhésions.
-- Migration additive : aucun reset, aucune suppression de données existantes.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'StatutDemandeAdhesion') THEN
        CREATE TYPE "StatutDemandeAdhesion" AS ENUM ('EN_ATTENTE', 'ACCEPTEE', 'REFUSEE');
    END IF;
END
$$;

-- Les tontines existantes n'ont aucun avertissement de suppression : NULL.
ALTER TABLE "tontines"
    ADD COLUMN IF NOT EXISTS "suppressionDemandeeAt" TIMESTAMP(3);

CREATE TABLE IF NOT EXISTS "demandes_adhesion" (
    "id"             TEXT        NOT NULL,
    "tontineId"      TEXT        NOT NULL,
    "userId"         TEXT        NOT NULL,
    "statut"         "StatutDemandeAdhesion" NOT NULL DEFAULT 'EN_ATTENTE',
    "motifRefus"     TEXT,
    "traiteeParId"   TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "traiteeAt"      TIMESTAMP(3),

    CONSTRAINT "demandes_adhesion_pkey" PRIMARY KEY ("id")
);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'demandes_adhesion_tontineId_fkey'
    ) THEN
        ALTER TABLE "demandes_adhesion"
            ADD CONSTRAINT "demandes_adhesion_tontineId_fkey"
            FOREIGN KEY ("tontineId") REFERENCES "tontines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'demandes_adhesion_userId_fkey'
    ) THEN
        ALTER TABLE "demandes_adhesion"
            ADD CONSTRAINT "demandes_adhesion_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;

CREATE INDEX IF NOT EXISTS "demandes_adhesion_tontineId_statut_idx"
    ON "demandes_adhesion"("tontineId", "statut");
CREATE INDEX IF NOT EXISTS "demandes_adhesion_userId_idx"
    ON "demandes_adhesion"("userId");
