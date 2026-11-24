-- Phase 2 : cotisation hebdomadaire à un jour fixe de la semaine (UTC).
-- Migration additive : aucune suppression ni reset de données.

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'JourSemaine') THEN
        CREATE TYPE "JourSemaine" AS ENUM (
            'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'
        );
    END IF;
END
$$;

-- Valeur par défaut LUNDI : les tontines existantes restent valides sans backfill.
ALTER TABLE "tontines"
    ADD COLUMN IF NOT EXISTS "jourCotisation" "JourSemaine" NOT NULL DEFAULT 'LUNDI';
