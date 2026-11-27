import logging
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.config import settings
from app.database import init_db
from app.routers import auth, member, tontines, subscriptions, admin, payments

# Configuration des logs
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s"
)
logger = logging.getLogger("tontine-saas-backend")

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Cycle de vie de l'application FastAPI :
    Initialise automatiquement les tables SQLAlchemy dans PostgreSQL au démarrage.
    """
    logger.info("Démarrage du backend FastAPI Tontine-SaaS...")
    try:
        init_db()
    except Exception as e:
        logger.error(f"Erreur lors de l'initialisation de la base PostgreSQL : {e}")
    yield
    logger.info("Arrêt du backend FastAPI.")

app = FastAPI(
    title="Tontine SaaS API",
    description="API REST Backend développée avec FastAPI et SQLAlchemy pour la gestion de tontines sénégalaises.",
    version="1.0.0",
    lifespan=lifespan,
)

# Configuration CORS sécurisée (origines explicites uniquement lorsque les credentials sont autorisés)
origins = [
    settings.FRONTEND_URL,
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enregistrement des routeurs avec le préfixe /api pour correspondre au reverse proxy Next.js
api_prefix = "/api"
app.include_router(auth.router, prefix=api_prefix)
app.include_router(member.router, prefix=api_prefix)
app.include_router(tontines.router, prefix=api_prefix)
app.include_router(subscriptions.router, prefix=api_prefix)
app.include_router(admin.router, prefix=api_prefix)
app.include_router(payments.router, prefix=api_prefix)

# Enregistrement également sans le préfixe /api pour flexibilité d'appel direct
app.include_router(auth.router)
app.include_router(member.router)
app.include_router(tontines.router)
app.include_router(subscriptions.router)
app.include_router(admin.router)
app.include_router(payments.router)

@app.get("/")
def root():
    return {
        "projet": "Tontine SaaS - API Backend",
        "langage": "Python 3",
        "framework": "FastAPI",
        "orm": "SQLAlchemy",
        "bdd": "PostgreSQL",
        "status": "online",
        "documentation": "/docs"
    }

@app.get("/health")
def health_check():
    return {"status": "ok"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=settings.PORT, reload=True)
