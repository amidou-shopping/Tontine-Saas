import os
import secrets
from dotenv import load_dotenv

# Charger les variables du fichier .env
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))

class Settings:
    # URL de connexion PostgreSQL pour SQLAlchemy
    # Format attendu : postgresql+psycopg2://user:password@host:port/dbname
    RAW_DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://tontine:tontine@localhost:5433/tontine_saas?schema=public"
    )

    # Conversion automatique de postgresql:// en postgresql+psycopg2:// pour SQLAlchemy
    @property
    def DATABASE_URL(self) -> str:
        url = self.RAW_DATABASE_URL
        if url.startswith("postgresql://"):
            url = url.replace("postgresql://", "postgresql+psycopg2://", 1)
        # Supprimer ?schema=public si présent car psycopg2 le gère différemment
        if "?schema=" in url:
            url = url.split("?schema=")[0]
        return url

    PORT: int = int(os.getenv("PORT", 3001))
    FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:3000")
    JWT_SECRET: str = os.getenv("JWT_SECRET") or ""
    if not JWT_SECRET:
        if os.getenv("NODE_ENV", "").lower() == "production":
            raise RuntimeError("JWT_SECRET doit être défini en production.")
        JWT_SECRET = secrets.token_urlsafe(48)
        print("[SECURITE] JWT_SECRET absent : clé éphémère générée pour ce processus.")
    JWT_ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 jours

    # Gouvernance et Super-Admin
    MAX_SUPER_ADMINS: int = int(os.getenv("MAX_SUPER_ADMINS")) if os.getenv("MAX_SUPER_ADMINS") else 3
    SUPER_ADMIN_PRINCIPAL_EMAIL: str = os.getenv("SUPER_ADMIN_PRINCIPAL_EMAIL") or "admin@tontine-saas.com"
    SUPER_ADMIN_PASSWORD: str = os.getenv("SUPER_ADMIN_PASSWORD") or "SuperAdmin2026!"

    # Paramètres financiers par défaut
    TAUX_COMMISSION: float = float(os.getenv("TAUX_COMMISSION_PLATEFORME", 0.03)) if os.getenv("TAUX_COMMISSION_PLATEFORME") else 0.03
    TAUX_AMENDE: float = float(os.getenv("TAUX_AMENDE_RETARD", 0.10)) if os.getenv("TAUX_AMENDE_RETARD") else 0.10
    FRAIS_PASSAGE_ADMIN: int = int(os.getenv("FRAIS_PASSAGE_ADMIN", 1000)) if os.getenv("FRAIS_PASSAGE_ADMIN") else 1000

    # Secrets de webhook pour vérification des signatures HMAC
    WAVE_WEBHOOK_SECRET: str = os.getenv("WAVE_WEBHOOK_SECRET", "dev-wave-webhook-secret-change-me")
    ORANGE_MONEY_WEBHOOK_SECRET: str = os.getenv("ORANGE_MONEY_WEBHOOK_SECRET", "dev-orange-webhook-secret-change-me")
    PAYTECH_API_SECRET: str = os.getenv("PAYTECH_API_SECRET", "dev-paytech-api-secret-change-me")

    # Contacts Support WhatsApp
    SUPPORT_1_NAME: str = os.getenv("SUPPORT_1_NAME", "Support Wave")
    SUPPORT_1_PHONE: str = os.getenv("SUPPORT_1_PHONE", "221770000000")
    SUPPORT_2_NAME: str = os.getenv("SUPPORT_2_NAME", "Support Orange Money")
    SUPPORT_2_PHONE: str = os.getenv("SUPPORT_2_PHONE", "221770000001")
    SUPPORT_3_NAME: str = os.getenv("SUPPORT_3_NAME", "Support technique")
    SUPPORT_3_PHONE: str = os.getenv("SUPPORT_3_PHONE", "221770000002")

settings = Settings()
