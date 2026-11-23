-- Ajout du code d'invitation sur les tontines et création de la table notifications.
-- Ce script est idempotent : chaque objet n'est créé que s'il n'existe pas déjà.

-- Colonne codeInvitation (valeurs uniques dérivées de l'id pour les lignes existantes)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'tontines'
          AND column_name = 'codeInvitation'
    ) THEN
        ALTER TABLE "tontines" ADD COLUMN "codeInvitation" TEXT;

        UPDATE "tontines"
        SET "codeInvitation" = UPPER(SUBSTRING(MD5("id"), 1, 8));

        ALTER TABLE "tontines" ALTER COLUMN "codeInvitation" SET NOT NULL;
    END IF;
END
$$;

-- Contrainte d'unicité sur codeInvitation
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'tontines_codeInvitation_key'
          AND conrelid = 'public.tontines'::regclass
    ) THEN
        ALTER TABLE "tontines"
            ADD CONSTRAINT "tontines_codeInvitation_key" UNIQUE ("codeInvitation");
    END IF;
END
$$;

-- Table notifications (conforme au modèle Notification de schema.prisma)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'notifications'
    ) THEN
        CREATE TABLE "notifications" (
            "id" TEXT NOT NULL,
            "userId" TEXT NOT NULL,
            "titre" TEXT NOT NULL,
            "message" TEXT NOT NULL,
            "type" TEXT NOT NULL DEFAULT 'INFO',
            "lue" BOOLEAN NOT NULL DEFAULT false,
            "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
            CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
        );
    END IF;
END
$$;

-- Index composite [userId, lue]
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE schemaname = 'public' AND indexname = 'notifications_userId_lue_idx'
    ) THEN
        CREATE INDEX "notifications_userId_lue_idx" ON "notifications"("userId", "lue");
    END IF;
END
$$;

-- Clé étrangère vers users
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'notifications_userId_fkey'
          AND conrelid = 'public.notifications'::regclass
    ) THEN
        ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey"
            FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END
$$;
