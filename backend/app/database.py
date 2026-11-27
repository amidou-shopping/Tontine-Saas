import os
import logging
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker, Session
from app.config import settings

logger = logging.getLogger(__name__)

# Configuration du moteur de base de données SQLAlchemy pour PostgreSQL
database_url = settings.DATABASE_URL

# Fallback pour le développement local si PostgreSQL n'est pas encore démarré
try:
    engine = create_engine(
        database_url,
        pool_pre_ping=True,
        pool_size=10,
        max_overflow=20,
    )
    # Test de connexion rapide
    with engine.connect() as conn:
        logger.info("Connexion réussie à la base de données PostgreSQL via SQLAlchemy.")
except Exception as e:
    logger.warning(
        f"Impossible de se connecter immédiatement à PostgreSQL ({database_url}) : {e}. "
        "Basculement en mode SQLite local temporaire pour le développement."
    )
    sqlite_url = "sqlite:///./tontine_saas.db"
    engine = create_engine(sqlite_url, connect_args={"check_same_thread": False})

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

def get_db():
    """
    Dépendance FastAPI injectant une session SQLAlchemy pour chaque requête HTTP.
    Garantit la fermeture propre de la session après l'exécution.
    """
    db: Session = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def init_db():
    """
    Crée automatiquement toutes les tables définies par les modèles SQLAlchemy
    dans la base de données PostgreSQL.
    """
    Base.metadata.create_all(bind=engine)
    logger.info("Toutes les tables SQLAlchemy ont été initialisées avec succès dans la base PostgreSQL.")
