# Tontine SaaS — MVP

Projet complet et exécutable : back-office Super-Admin, dashboard membre,
authentification par OTP, monétisation par commission, paiements simulés
(Wave / Orange Money / PayTech-PayDunya), création de tontines, invitations
par code, gestion des abonnements SaaS, notifications et profil utilisateur.

## Structure

```
tontine-saas/
├── docker-compose.yml               # PostgreSQL (5433) + Redis (6379)
│
├── backend/                         # API NestJS (port 3001)
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── migrations/              # migrations datées, dont codeInvitation + notifications
│   │   └── seed.ts                  # idempotent (relançable sans erreur)
│   ├── src/
│   │   ├── admin/                   # Back-office Super-Admin
│   │   ├── auth/                    # Inscription, OTP, renvoi, JWT, guards
│   │   ├── tontines/                # Cœur métier : rotation & cycles atomiques
│   │   ├── payments/                # Providers + webhooks HMAC + anti-replay
│   │   ├── member/                  # Endpoints consommés par le dashboard membre
│   │   ├── subscriptions/           # Abonnements SaaS & limites de création
│   │   ├── notifications/           # Cron des échéances + rappels in-app
│   │   ├── audit/                   # Traçabilité des actions sensibles
│   │   ├── common/                  # Prisma/Redis/Audit globaux + utilitaires money
│   │   ├── app.module.ts
│   │   └── main.ts                  # active le rawBody pour les webhooks
│   ├── test/                        # tests Jest (monétisation, signatures HMAC)
│   └── .env.example
│
└── frontend/                        # Next.js App Router (port 3000)
    ├── app/
    │   ├── login/page.tsx
    │   ├── register/page.tsx
    │   ├── verify-otp/page.tsx      # vérification + renvoi du code
    │   ├── dashboard/page.tsx       # Dashboard membre
    │   ├── transactions/page.tsx    # Historique des transactions
    │   ├── join/[code]/page.tsx     # Rejoint une tontine par code d'invitation
    │   ├── profil/page.tsx
    │   ├── tontines/[id]/page.tsx
    │   ├── admin-tontines/page.tsx
    │   └── admin/dashboard/page.tsx
    ├── components/
    │   ├── Navigation.tsx           # rôle lu depuis l'API + cloche de notifications
    │   ├── NotificationsBell.tsx
    │   └── MemberDashboard.tsx
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
npx prisma migrate deploy     # applique les migrations datées (jamais migrate dev en équipe)
npm run prisma:seed           # facultatif : comptes de démo + tontine (idempotent)
npm run start:dev             # API sur http://localhost:3001

# 3. Frontend (second terminal)
cd frontend
cp .env.local.example .env.local
npm install
npm run dev                   # Site sur http://localhost:3000
```

Ouvre **http://localhost:3000** : tu arrives sur `/login`.

**Compte de démo (créé par le seed)** : `admin@tontine.sn` / `Password123!` → dashboard Super-Admin.
Autres comptes : `aissatou@example.com` (ADMIN_TONTINE), `moussa@example.com` et
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

| Variable | Valeur par défaut (dev) | Rôle |
|---|---|---|
| `DATABASE_URL` | `postgresql://...:5433/...` | PostgreSQL Docker |
| `REDIS_HOST` / `REDIS_PORT` | `localhost` / `6379` | OTP, rate-limiting, anti-replay webhooks |
| `JWT_SECRET` | à changer en prod | Signature des tokens |
| `WAVE_WEBHOOK_SECRET` | `dev-wave-webhook-secret-change-me` | HMAC des webhooks Wave |
| `ORANGE_MONEY_WEBHOOK_SECRET` | `dev-orange-webhook-secret-change-me` | HMAC des webhooks Orange Money |
| `PAYTECH_API_SECRET` | `dev-paytech-api-secret-change-me` | HMAC des webhooks PayTech/PayDunya |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_SECURE` | non définis | Serveur SMTP pour l'envoi réel du code OTP |
| `SMTP_USER` / `SMTP_PASS` / `MAIL_FROM` | non définis | Identifiants et expéditeur de l'email de vérification |
| `API_URL` (frontend) | `http://localhost:3001` | Destination du rewrite `/api/*` |

Les secrets webhook sont des valeurs **de développement** : remplace-les par de
vraies valeurs côté provider et dans l'environnement de production. La
vérification HMAC est obligatoire : un webhook non signé est rejeté (400).

## Fonctionnalités

### Authentification & sécurité
- Inscription avec vérification OTP à 6 chiffres (généré via `crypto.randomInt`, stocké dans Redis avec TTL de 5 min), envoyé par email au créateur de compte
- Renvoi de code : 60 s entre deux envois, 3 par heure ; 5 tentatives incorrectes / 15 min
- Connexion : bcrypt 12 rounds, 5 tentatives / 15 min, comparaison à temps constant
- JWT avec `JwtAuthGuard` + `RolesGuard` ; le rôle et le statut sont rechargés depuis la DB à chaque requête
- Validation stricte des DTO (`class-validator`, `whitelist: true`)
- `AuditLog` sur les actions sensibles (création/démarrage de tontine, abonnements, blocages)

### Tontines
- Création avec code d'invitation unique (8 caractères hex), limitée par l'abonnement
- Rejoindre par code (`/join/[code]`) ou depuis la liste des tontines en attente
- Démarrage uniquement par le propriétaire (nombre de membres requis atteint)
- Rotation automatique : `ordrePassage` + `cycleActuel` désignent le bénéficiaire
- Clôture de cycle **atomique** : verrou PostgreSQL `pg_advisory_xact_lock`, cotisation + commission + versement + passage au cycle suivant dans une seule transaction (pas de double paiement ni de double versement)
- Un membre en retard est réactivé dès qu'il régularise ; un membre exclu sort de la rotation

### Paiements
- Wave, Orange Money, PayTech/PayDunya derrière une interface commune (`PaymentProviderClient`)
- Mode simulation : le bouton « Payer » crée un `PendingPayment` puis appelle exactement le même service que le webhook
- Webhooks : HMAC-SHA256 sur le **corps brut**, timestamp (5 min) et nonce anti-replay (Redis), idempotence via `PendingPayment`
- Un webhook tardif après simulation est ignoré proprement ; un webhook réel manquant peut être rejoué sans doubler la cotisation

### Monétisation
- Commission de 1,5 % par défaut, calculée et enregistrée **par cotisation**
- La cagnotte versée = somme des montants **nets** du ledger (cohérente avec les commissions, même avec arrondis)
- Abonnements SaaS : GRATUIT (1 tontine), STANDARD 5 000 FCFA (5 tontines), PREMIUM 15 000 FCFA (illimité)
- Les plans payants créent une transaction `ABONNEMENT` simulée avant activation ; les `MEMBER` ne peuvent pas souscrire

### Notifications & profil
- Cron quotidien (8h) : détection des retards, statut `EN_RETARD`, notification in-app + rappel SMS simulé
- Cloche de notifications dans la navigation : liste, marquer comme lu
- Notification de cagnotte reçue au bénéficiaire
- Profil (lecture/mise à jour) : la vérification porte sur l'email, changer de numéro ne la réinitialise pas
- Historique des transactions (`/transactions`) et détail d'une tontine (membres + transactions)

## Comment l'authentification fonctionne ici

- Le frontend appelle `/api/*` (ex. `/api/auth/login`) ; `next.config.js` redirige côté serveur vers l'API NestJS (pas de CORS navigateur).
- À la connexion, le JWT est stocké dans `localStorage` (`lib/api.ts`) et envoyé en `Authorization: Bearer` sur chaque requête.
- Les erreurs 401 effacent la session et redirigent vers `/login` (sauf sur `/api/auth/*`, pour préserver les messages de connexion/OTP).
- Le **rôle affiché** dans la navigation et les gardes frontend est vérifié côté API via `GET /api/member/profil` : un bit de rôle modifié côté client ne suffit pas à accéder à une page admin (les endpoints restent protégés par les guards backend).

## Points clés d'architecture

1. **Infrastructure globale** : `CommonModule` fournit une seule instance de `PrismaService`, `RedisService` et `AuditService` à tous les modules.
2. **Sécurité** : OTP et rate-limiting dans Redis, JWT rechargé depuis la DB, HMAC timing-safe sur raw body, anti-replay, DTO validés, `AuditLog`.
3. **Monétisation** : `monetization.util.ts` centralise le calcul de la commission unitaire ; `SubscriptionsService.peutCreerTontine()` applique les limites avec prise en compte de `dateFin`.
4. **Paiements** : simulation et webhooks convergent vers `TontinesService.enregistrerCotisation()`, avec transaction Prisma + verrou advisory.
5. **Rotation** : le versement est déclenché quand tous les participants ont payé le cycle courant ; la somme versée est la somme des nets réellement enregistrés.
6. **Cron quotidien** : `NotificationsService` marque les retards et crée les notifications in-app.
7. **Invitations** : `codeInvitation` unique (contrainte DB + migration datée), page dédiée `/join/[code]`.

## Vérifications

```bash
# Backend
cd backend
npm run build
npm test -- --runInBand
npx prisma validate
npx prisma migrate status

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

- Les paiements « Payer ma cotisation » sont confirmés immédiatement (simulation) ; le flux webhook réel est implémenté et testé, mais nécessite les clés/secrets du provider pour être activé.
- Le JWT est stocké en `localStorage` (simple pour un MVP) plutôt qu'en cookie `httpOnly` — à durcir avant une mise en production réelle (XSS).
- Les SMS et WhatsApp des rappels de cotisation sont simulés dans les logs — à brancher sur un vrai fournisseur (Twilio, agrégateur local sénégalais). Le code OTP, lui, part par email (SMTP réel configurable, sinon simulé dans les logs).
- Les abonnements payants sont encaissés en simulation aux fins de démonstration.
