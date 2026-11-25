-- Point 4 : SUPER_ADMIN principal unique, création réservée au seed/CLI.
-- Additif et sans reset : aucun compte existant n'est supprimé ni rétrogradé.

ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "estPrincipal" BOOLEAN NOT NULL DEFAULT false;

-- Garantie base de données : une seule ligne peut avoir estPrincipal = true.
-- Le contrôle applicatif est également fait dans la transaction de création.
CREATE UNIQUE INDEX IF NOT EXISTS "users_estPrincipal_principal_idx"
    ON "users"("estPrincipal") WHERE "estPrincipal" = true;
