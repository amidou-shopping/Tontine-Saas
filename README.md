# Tontine SaaS — MVP

Projet complet et exécutable, livré en 6 phases : back-office Super-Admin,
dashboard membre, authentification par OTP, règles financières atomiques
(commission, amendes, arriéré), cotisations hebdomadaires à jour choisi,
gouvernance des rôles, contacts support WhatsApp, abonnements SaaS configurables
et paiements simulés (Wave / Orange Money / PayTech-PayDunya).

## Structure

```
tontine-saas/
├── docker-compose.yml               # PostgreSQL (5433) + Redis (6379)
│
├── backend/                         # API NestJS (port 3001)
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/              # 9 migrations datées (jamais de reset en équipe)
│   │   └── seed.ts                  # idempotent ; refuse NODE_ENV=production
│   ├── src/
│   │   ├── admin/                   # Back-office Super-Admin + promotion
│   │   ├── auth/                    # Inscription, OTP, renvoi, JWT, guards
│   │   ├── tontines/                # Cœur métier : rotation & cycles atomiques
│   │   ├── payments/                # Providers + webhooks HMAC + anti-replay
│   │   ├── member/                  # Endpoints du dashboard membre + support
│   │   ├── subscriptions/           # Grille, essai, expiration, renouvellement
│   │   ├── notifications/           # Cron des échéances + rappels in-app
│   │   ├── audit/                   # Traçabilité des actions sensibles
│   │   ├── common/                  # Prisma/Redis/Audit + utilitaires métier
│   │   │                            # (finances, dates UTC, abonnements, support,
│   │   │                            #  gouvernance Super-Admin)
│   │   ├── app.module.ts
│   │   └── main.ts                  # active le rawBody pour les webhooks
│   ├── test/                        # 9 suites Jest (règles métier, HMAC, etc.)
│   └── .env.example
│
└── frontend/                        # Next.js App Router (port 3000)
    ├── app/
    │   ├── login/page.tsx
    │   ├── register/page.tsx
    │   ├── verify-otp/page.tsx      # vérification + renvoi du code
    │   ├── dashboard/page.tsx       # Dashboard membre
    │   ├── transactions/page.tsx    # Historique des transactions
    │   ├── join/[code]/page.tsx     # Demande d'adhésion par code d'invitation
    │   ├── profil/page.tsx          # Profil + abonnement (grille, essai, renouvellement)
    │   ├── tontines/[id]/page.tsx
    │   ├── admin-tontines/page.tsx  # Demandes, tirage au sort, exclusions, suppression
    │   └── admin/dashboard/page.tsx # Pilotage + promotion des Super-Admins
    ├── components/
    │   ├── Navigation.tsx           # rôle lu depuis l'API + cloche de notifications
    │   ├── NotificationsBell.tsx
    │   ├── SupportButton.tsx        # Bouton flottant WhatsApp (utilisateur connecté)
    │   ├── MemberDashboard.tsx      # Paiement de l'arriéré en deux temps
    │   └── admin/UsersTable.tsx     # Blocage + promotion Super-Admin
    ├── lib/api.ts                   # Fetch authentifié + gestion de session/erreurs
    └── next.config.js               # Proxy /api/* → API NestJS
```

## Démarrage rapide

```bash
# 1. PostgreSQL + Redis (Docker doit être installé)
docker compose up -d

# 2. Backend
cd backend
cp .env.example .env          # DATABASE_URL pré-rempli pour le docker-compose (port 5433)
npm install
npx prisma generate
npx prisma migrate deploy     # applique les 9 migrations datées (jamais migrate dev en équipe)
npm run prisma:seed           # facultatif, DEVELOPPEMENT UNIQUEMENT ; idempotent
npm run start:dev             # API sur http://localhost:3001

# 3. Frontend (second terminal)
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                   # Site sur http://localhost:3000
```

Ouvre **http://localhost:3000** : tu arrives sur `/login`.

**Compte de démo (créé par le seed, développement uniquement)** :
`admin@tontine.sn` / `Password123!` → dashboard Super-Admin. Le seed refuse
formellement de s'exécuter si `NODE_ENV=production` : ni création du compte,
ni annonce du mot de passe dans les logs. Autres comptes de démo :
`aissatou@example.com` (ADMIN_TONTINE), `moussa@example.com` et
`khady@example.com` (MEMBER), tous avec `Password123!`.

À l'inscription, le code OTP à 6 chiffres est envoyé à **l'adresse email du
créateur de compte**, jamais au numéro de téléphone. Si un SMTP est configuré
(voir variables ci-dessous), l'email est réellement livré ; sinon, en
développement, le code s'affiche dans les logs du backend
(`[EMAIL SIMULÉ] Envoi du code ... à ...`). La page `/verify-otp` affiche
l'adresse concernée. En cas de perte/expiration, le bouton **Renvoyer le code**
envoie un nouveau code au même email (60 s entre deux envois, 3 renvois maximum
par heure).

## Configuration

Toutes les valeurs par défaut (taux, plafonds, prix, durées) sont portées par le
singleton `ParametresPlateforme` et les migrations datées. Les variables
d'environnement ci-dessous sont des **surcharges facultatives** : vide = on
utilise la valeur de la table. Aucun montant FCFA n'est un `Float` ; l'arrondi
vers l'entier inférieur est centralisé dans `common/finances.util.ts`.

| Variable | Valeur par défaut | Rôle |
|---|---|---|
| `DATABASE_URL` | `postgresql://...:5433/tontine_saas` | PostgreSQL Docker |
| `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` | `localhost` / `6379` / vide | OTP, rate-limiting, anti-replay webhooks |
| `JWT_SECRET` | à changer en prod | Signature des tokens |
| `FRONTEND_URL` / `APP_URL` / `PORT` | `localhost:3000` / `localhost:3001` / `3001` | CORS et URL de l'API |
| `NODE_ENV` | `development` | `production` interdit le seed démo |
| `API_URL` (frontend) | `http://localhost:3001` | Destination du rewrite `/api/*` |
| `TAUX_COMMISSION_PLATEFORME` | 0,03 (3 %) | Commission par cotisation |
| `TAUX_AMENDE_RETARD` | 0,10 (10 %) | Amende sur cotisation en retard |
| `DELAI_GRACE_HEURES` | 24 | Grâce avant amende |
| `DELAI_AVERTISSEMENT_SUPPRESSION_JOURS` | 7 | Délai avant suppression sécurisée d'une tontine |
| `MAX_SUPER_ADMINS` | 3 | Plafond des Super-Admins |
| `SUPPORT_1_NAME` / `SUPPORT_1_PHONE` … `SUPPORT_3_*` | placeholders fictifs | Contacts WhatsApp (format international **sans `+`**) |
| `PRIX_STANDARD_FCFA` | 5000 | Prix du plan STANDARD (entier) |
| `PRIX_PREMIUM_FCFA` | 15000 | Prix du plan PREMIUM (entier) |
| `LIMITE_TONTINES_GRATUITES` | 1 | Nombre de tontines du plan GRATUIT |
| `LIMITE_TONTINES_STANDARD` | 5 | Nombre de tontines du plan STANDARD |
| `DUREE_ESSAI_JOURS` | 14 | Période d'essai gratuite (une par utilisateur) |
| `DUREE_ABONNEMENT_JOURS` | 30 | Durée d'un plan payant après paiement |
| `WAVE_WEBHOOK_SECRET` | `dev-wave-webhook-secret-change-me` | HMAC des webhooks Wave |
| `ORANGE_MONEY_WEBHOOK_SECRET` | `dev-orange-webhook-secret-change-me` | HMAC des webhooks Orange Money |
| `PAYTECH_API_SECRET` | `dev-paytech-api-secret-change-me` | HMAC des webhooks PayTech/PayDunya |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | non définis | Serveur SMTP pour l'envoi réel du code OTP |
| `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | non définis | Identifiants et expéditeur de l'email de vérification |

Les secrets webhook sont des valeurs **de développement** : remplace-les par de
vraies valeurs côté provider et dans l'environnement de production, jamais dans
le dépôt. La vérification HMAC est obligatoire : un webhook non signé est rejeté
(400). Les numéros de support dans `.env.example` sont des placeholders ; ne
jamais committer de numéro réel ni de secret.

## Migrations (sans reset de base)

Les migrations sont datées et additives : les tontines et abonnements existants
continuent avec les valeurs par défaut. Ne jamais utiliser `migrate reset` ni
`migrate dev` sur un environnement partagé.

```bash
cd backend
npx prisma validate
npx prisma migrate deploy                       # base de développement
npx prisma migrate status                       # doit afficher "up to date"

# Base de test isolée (jamais la base de dev)
$env:DATABASE_URL='postgresql://tontine:tontine@localhost:5433/tontine_saas_test?schema=public'; npx prisma migrate deploy
```

Ordre des migrations : `20260819173126_init`, `20260928134404_add_pending_payments`,
`20261120221000_add_invitation_code_and_notifications`,
`20261123093000_regles_financieres_phase1` (3 % + amendes + paramètres),
`20261123110000_jour_cotisation_hebdomadaire`,
`20261123120000_gouvernance_phase3`,
`20261123121000_delai_avertissement_suppression`,
`20261124090000_plafond_super_admins`,
`20261124100000_abonnements_configurables`.

## Fonctionnalités et règles métier

### Authentification & sécurité
- Inscription avec vérification OTP à 6 chiffres (`crypto.randomInt`, TTL 5 min dans Redis), envoyé par email
- Renvoi : 60 s entre deux envois, 3 par heure ; 5 tentatives incorrectes / 15 min
- Connexion : bcrypt 12 rounds, 5 tentatives / 15 min, comparaison à temps constant
- JWT avec `JwtAuthGuard` + `RolesGuard` ; rôle et statut rechargés depuis la DB à chaque requête
- **Aucune route publique n'accorde `SUPER_ADMIN`** : l'inscription force `MEMBER`, `/member/devenir-admin` donne uniquement `ADMIN_TONTINE` ; la seule élévation est `POST /admin/users/:id/promouvoir-super-admin`, protégée et transactionnelle

### Tontines et règles financières
- Cotisation **hebdomadaire** au `jourCotisation` choisi (`LUNDI` par défaut), échéances calculées en UTC
- Adhésion sur demande : le créateur accepte ou refuse ; plus d'inscription directe par code
- Démarrage au prochain jour choisi ; tirage au sort des rangs avec `randomInt` (Fisher-Yates) dans la transaction
- Rotation automatique : `ordrePassage` + `cycleActuel` désignent le bénéficiaire
- Clôture de cycle **atomique** : verrou `pg_advisory_xact_lock`, cotisation + commission 3 % + versement + cycle suivant dans une seule transaction
- Retard : amende de 10 % après 24 h de grâce, calculée une seule fois et stockée dans `AmendeRetard`
- Arriéré réglé en deux paiements via le même endpoint : d'abord le tour précédent (`cycleConcerne`), puis le tour courant ; bouton dédié côté membre
- Exclusion : statut `EXCLU`, paiements bloqués, remboursement net créé une seule fois à la clôture
- Suppression Super-Admin : avertissement daté + délai configurable, notification et audit ; jamais si de l'argent est engagé

### Paiements
- Wave, Orange Money, PayTech/PayDunya derrière une interface commune (`PaymentProviderClient`)
- Mode simulation : le bouton « Payer » crée un `PendingPayment` puis appelle exactement le même service que le webhook
- Webhooks : HMAC-SHA256 sur le **corps brut**, timestamp (5 min) et nonce anti-replay (Redis), idempotence via `PendingPayment`
- Un webhook tardif après simulation est ignoré proprement ; un webhook réel manquant peut être rejoué sans doubler la cotisation

### Abonnements (Phase 6)
- Grille configurable (prix, limites, durées) lue depuis `ParametresPlateforme`, surchargeable par variables
- Premier passage à un plan payant : **14 jours d'essai gratuit**, une seule fois par utilisateur (verrou advisory par utilisateur)
- Ensuite : paiement **simulé** (transaction `ABONNEMENT` réussie, montant entier FCFA) et accès de 30 jours
- Une `dateFin` dépassée bloque la création de tontine même si le booléen `actif` est vrai ; bouton **Renouveler** dans le profil
- `GRATUIT` = 1 tontine, `STANDARD` = 5, `PREMIUM` = illimité ; les `MEMBER` ne peuvent pas souscrire ni créer

### Gouvernance & support
- Au maximum 3 Super-Admins (configurable), promotion vérifiée dans une transaction verrouillée, auditée et notifiée
- Comptes démo protégés : seed refusé en production ; `admin@tontine.sn` créé/promu uniquement en développement
- Bouton flottant « Aide » visible uniquement connecté : 3 contacts support et liens `wa.me` préremplis avec l'identifiant (construits côté serveur, `GET /member/support-contacts`)

### Notifications & profil
- Cron quotidien (8 h) : rappels veille/jour/retard idempotents, statut `EN_RETARD`, notification in-app + SMS simulé
- Cloche de notifications : liste, marquer comme lu ; notification de cagnotte reçue
- Profil (lecture/mise à jour) : vérification par email ; affichage du plan, de l'échéance et du statut d'essai/expiration

## Comment l'authentification fonctionne ici

- Le frontend appelle `/api/*` (ex. `/api/auth/login`) ; `next.config.js` redirige côté serveur vers l'API NestJS (pas de CORS navigateur).
- À la connexion, le JWT est stocké dans `localStorage` (`lib/api.ts`) et envoyé en `Authorization: Bearer` sur chaque requête.
- Les erreurs 401 effacent la session et redirigent vers `/login` (sauf sur `/api/auth/*`, pour préserver les messages de connexion/OTP).
- Le **rôle affiché** dans la navigation et les gardes frontend est vérifié côté API via `GET /api/member/profil` : un bit de rôle modifié côté client ne suffit pas à accéder à une page admin (les endpoints restent protégés par les guards backend).

## Points clés d'architecture

1. **Infrastructure globale** : `CommonModule` fournit une seule instance de `PrismaService`, `RedisService` et `AuditService`.
2. **Règles côté serveur** : montants entiers FCFA, arrondi centralisé, calculs financiers et transitions de statut dans des transactions Prisma avec verrous advisory pour la clôture, le plafond Super-Admin et l'essai abonnement.
3. **Configuration** : `ParametresPlateforme` est la source unique des taux/plafonds/prix/durées ; les variables d'environnement ne font que surcharger.
4. **Paiements** : simulation et webhooks convergent vers `TontinesService.enregistrerCotisation()`.
5. **Rotation** : le versement est déclenché quand tous les participants ont payé le cycle courant ; la somme versée est la somme des nets réellement enregistrés.
6. **Cron quotidien** : `NotificationsService` marque les retards et crée les notifications in-app.
7. **Invitations** : `codeInvitation` unique (contrainte DB + migration datée), page dédiée `/join/[code]`.

## Vérifications

```bash
# Backend
cd backend
npm run build
npm test -- --runInBand          # 9 suites, 77 tests
npx prisma validate
npx prisma migrate status

# Garde-fou du seed (doit échouer volontairement)
$env:NODE_ENV='production'; npm run prisma:seed

# Frontend
cd frontend
npm run typecheck
npm run build
```

Les deux projets utilisent des dépendances à jour (NestJS 12, Next.js 16,
React 19) : `npm audit` ne remonte **aucune vulnérabilité** ni dans `backend/`
ni dans `frontend/`. Le mot de passe est haché avec `bcryptjs` (pur JS, aucun
binaire natif à compiler, hashes `$2b$` compatibles avec ceux déjà en base).

Le smoke test HTTP couvre : `/auth/login`, `/admin/dashboard`, `/admin/users`,
`/tontines`, `/subscriptions`, `/member/notifications`, le renvoi OTP, le
webhook signé (200) vs non signé (400), la clôture d'un cycle complet et les
limites d'abonnement.

## Ce qui reste volontairement simplifié pour le MVP

- Les paiements de cotisation sont confirmés immédiatement (simulation) ; le flux webhook réel est implémenté et testé, mais nécessite les clés/secrets du provider pour être activé.
- Les abonnements payants (essai inclus) sont encaissés en simulation : aucune transaction d'argent réelle n'est effectuée.
- Le JWT est stocké en `localStorage` (simple pour un MVP) plutôt qu'en cookie `httpOnly` — à durcir avant une mise en production réelle (XSS).
- Les SMS et WhatsApp des rappels sont simulés dans les logs — à brancher sur un vrai fournisseur. Le code OTP, lui, part par email (SMTP réel configurable, sinon simulé dans les logs).
- Le tirage au sort des rangs utilise `crypto.randomInt` sans tiers de confiance externe : à remplacer par une source d'aléa auditable pour une grande tontine.
- Les contacts support sont au nombre de trois maximum, configurés par variables d'environnement (pas d'interface d'administration dédiée).
