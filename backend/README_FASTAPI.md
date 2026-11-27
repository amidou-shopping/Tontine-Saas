# Backend Python (FastAPI + SQLAlchemy + PostgreSQL) — Tontine SaaS

Ce backend implémente l'ensemble de l'API de gestion de tontines en **Python (FastAPI)** avec **SQLAlchemy ORM** relié à la base de données **PostgreSQL**.

---

## 1. Architecture du Backend

```
backend/
├── app/
│   ├── config.py              # Configuration & variables d'environnement (.env)
│   ├── database.py            # Moteur SQLAlchemy (Engine, SessionLocal, Base, get_db)
│   ├── models.py              # Modèles SQLAlchemy mappés sur PostgreSQL (User, Tontine, etc.)
│   ├── schemas.py             # Schémas de validation Pydantic v2 (camelCase compatible Next.js)
│   ├── security.py            # Hachage bcrypt, génération & validation JWT, guards de rôles
│   ├── utils/
│   │   ├── dates.py           # Calculs de cycles hebdomadaires en UTC
│   │   └── finances.py        # Calculs des commissions et amendes
│   └── routers/
│       ├── auth.py            # Inscription, OTP, connexion (/api/auth)
│       ├── member.py          # Profil, tontines membre, règlements, notifications (/api/member)
│       ├── tontines.py        # Création, adhésions par code, validation (/api/tontines)
│       ├── subscriptions.py   # Forfaits SaaS, changement de plan, renouvellement (/api/subscriptions)
│       ├── admin.py           # Pilotage back-office Super-Admin & KPIs (/api/admin)
│       └── payments.py        # Webhooks Wave / Orange Money / PayTech (/api/payments)
├── demo_sqlalchemy.py         # Script pédagogique illustrant l'instanciation de modèles
├── seed.py                    # Peuplement initial (Super-Admin, tontines démo)
├── test_api.py                # Suite de tests d'intégration automatisés
├── run_server.py              # Démarrage du serveur Uvicorn sur le port 3001
├── requirements.txt           # Dépendances Python
└── .env                       # Paramètres locaux (DATABASE_URL, JWT_SECRET, PORT)
```

---

## 2. Instanciation d'un modèle SQLAlchemy et liaison avec PostgreSQL

Pour enregistrer de nouvelles entités dans PostgreSQL via SQLAlchemy, le processus se décompose en 4 phases :

### A. Définition du modèle (Déclaratif)
```python
from sqlalchemy import Column, String, Boolean, DateTime, func
from app.database import Base

class User(Base):
    __tablename__ = "users"

    id = Column("id", String(36), primary_key=True)
    email = Column("email", String(255), unique=True, nullable=False)
    telephone = Column("telephone", String(50), unique=True, nullable=False)
    password_hash = Column("passwordHash", String(255), nullable=False)
    nom = Column("nom", String(100), nullable=False)
    prenom = Column("prenom", String(100), nullable=False)
    created_at = Column("createdAt", DateTime(timezone=True), default=func.now())
    updated_at = Column("updatedAt", DateTime(timezone=True), default=func.now(), onupdate=func.now())
```

### B. Création de l'instance du modèle en mémoire Python
```python
nouvel_utilisateur = User(
    email="fatou.diop@tontine.sn",
    telephone="+221771234567",
    password_hash=hash_password("Passer123!"),
    nom="Diop",
    prenom="Fatou",
    is_verified=True,
)
```

### C. Ajout à la session de travail (Unit of Work)
```python
db.add(nouvel_utilisateur)
```

### D. Validation de la transaction (INSERT dans PostgreSQL)
```python
db.commit()              # Émet la requête SQL INSERT vers PostgreSQL
db.refresh(nouvel_utilisateur)  # Récupère l'ID et les timestamps générés par PostgreSQL
```

---

## 3. Démarrage et utilisation

### Activer l'environnement virtuel :
```powershell
.\.venv\Scripts\Activate.ps1
```

### Démarrer le serveur API (port 3001) :
```powershell
python run_server.py
# ou
npm run start:python
```
- L'API est accessible sur : `http://localhost:3001`
- La documentation interactive Swagger / OpenAPI : `http://localhost:3001/docs`

### Exécuter le script de démonstration SQLAlchemy :
```powershell
python demo_sqlalchemy.py
```

### Lancer les tests d'intégration :
```powershell
python -m unittest test_api.py
```

### Comptes de démonstration préconfigurés :
- **Super-Admin** : `admin@tontine.sn` ou `admin@tontine-saas.com` / `SuperAdmin2026!`
- **Admin Tontine** : `aissatou@example.com` / `Passer123!`
- **Membre** : `moussa@example.com` / `Passer123!`
