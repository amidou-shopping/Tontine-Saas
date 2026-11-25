-- Point 2 : les notifications peuvent porter un lien interne cliquable.
-- Additif et sans reset : les notifications existantes restent sans lien.
ALTER TABLE "notifications"
    ADD COLUMN IF NOT EXISTS "lien" TEXT;
