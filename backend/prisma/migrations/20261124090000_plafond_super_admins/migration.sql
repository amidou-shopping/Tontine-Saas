-- Phase 4 : plafond configurable du nombre de SUPER_ADMIN.
-- Additif et idempotent : les paramètres existants gardent leurs valeurs.

ALTER TABLE "parametres_plateforme"
    ADD COLUMN IF NOT EXISTS "nombreMaxSuperAdmins" INTEGER NOT NULL DEFAULT 3;

UPDATE "parametres_plateforme"
    SET "nombreMaxSuperAdmins" = 3
    WHERE "cle" = 'global' AND "nombreMaxSuperAdmins" IS NULL;
