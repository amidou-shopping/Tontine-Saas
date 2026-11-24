-- Phase 6 : grille d'abonnements configurable et période d'essai gratuite.
-- Additif et idempotent : les abonnements existants gardent leur plan et
-- leurs dates ; seules les nouvelles colonnes sont ajoutées, avec des
-- valeurs par défaut identiques à celles de la Phase 5 (tontines existantes
-- non perturbées).

ALTER TABLE "parametres_plateforme"
    ADD COLUMN IF NOT EXISTS "prixStandardFcfa" INTEGER NOT NULL DEFAULT 5000,
    ADD COLUMN IF NOT EXISTS "prixPremiumFcfa" INTEGER NOT NULL DEFAULT 15000,
    ADD COLUMN IF NOT EXISTS "limiteTontinesGratuites" INTEGER NOT NULL DEFAULT 1,
    ADD COLUMN IF NOT EXISTS "limiteTontinesStandard" INTEGER NOT NULL DEFAULT 5,
    ADD COLUMN IF NOT EXISTS "dureeEssaiJours" INTEGER NOT NULL DEFAULT 14,
    ADD COLUMN IF NOT EXISTS "dureeAbonnementJours" INTEGER NOT NULL DEFAULT 30;

-- Un seul essai gratuit par utilisateur ; `enEssai` retrace la période en cours.
ALTER TABLE "subscriptions"
    ADD COLUMN IF NOT EXISTS "aUtiliseEssai" BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN IF NOT EXISTS "enEssai" BOOLEAN NOT NULL DEFAULT false;
