-- Phase 3 (complément) : délai d'avertissement avant suppression, configurable.
-- Additif et idempotent : les tontines et paramètres existants gardent leurs données.

ALTER TABLE "parametres_plateforme"
    ADD COLUMN IF NOT EXISTS "delaiAvertissementSuppressionJours" INTEGER NOT NULL DEFAULT 7;

UPDATE "parametres_plateforme"
    SET "delaiAvertissementSuppressionJours" = 7
    WHERE "cle" = 'global' AND "delaiAvertissementSuppressionJours" IS NULL;
