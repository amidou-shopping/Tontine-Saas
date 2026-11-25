-- Rattrapage : le créateur ADMIN_TONTINE est désormais membre ACTIF de sa
-- propre tontine (compte dans les membres, tirage, cotisation et tour).
--
-- Additif et sans reset : seules les tontines encore EN_ATTENTE au cycle 1
-- sont complétées. Les tontines déjà démarrées, suspendues ou terminées ne
-- sont PAS modifiées (aucun rang réattribué, aucun cycle perturbé) : un
-- NOTICE est émis et une trace est écrite dans audit_logs pour signaler la
-- tontine concernée.
DO $$
DECLARE
  t record;
  prochain_rang integer;
BEGIN
  FOR t IN
    SELECT id, "createurId", statut, "cycleActuel"
    FROM "tontines"
    ORDER BY "createdAt"
  LOOP
    -- Déjà membre : rien à faire (le rattrapage est idempotent).
    IF EXISTS (
      SELECT 1
      FROM "tontine_members"
      WHERE "tontineId" = t.id AND "userId" = t."createurId"
    ) THEN
      CONTINUE;
    END IF;

    IF t.statut = 'EN_ATTENTE' AND t."cycleActuel" = 1 THEN
      -- Rang libre négatif ou nul : le tirage au sort réattribuera les rangs
      -- au démarrage, sans heurter la contrainte d'unicité existante.
      SELECT COALESCE(MIN("ordrePassage"), 1) - 1
      INTO prochain_rang
      FROM "tontine_members"
      WHERE "tontineId" = t.id;

      INSERT INTO "tontine_members"
        ("id", "tontineId", "userId", "ordrePassage", "statut", "joinedAt")
      VALUES
        ('cmw_rattrapage_' || replace(t.id, '-', ''), t.id, t."createurId",
         prochain_rang, 'ACTIF', CURRENT_TIMESTAMP);
    ELSE
      RAISE NOTICE
        'Rattrapage ignoré pour la tontine % : statut %, cycle % (cycle en cours ou terminé).',
        t.id, t.statut, t."cycleActuel";

      INSERT INTO "audit_logs"
        ("id", "action", "cible", "details", "acteurId", "createdAt")
      VALUES
        ('rattrapage-createur-' || t.id,
         'RATTRAPAGE_CREATEUR_CYCLE_EN_COURS',
         t.id,
         json_build_object(
           'tontineId', t.id,
           'statut', t.statut,
           'cycleActuel', t."cycleActuel"
         )::text,
         'systeme',
         CURRENT_TIMESTAMP)
      ON CONFLICT ("id") DO NOTHING;
    END IF;
  END LOOP;
END $$;
