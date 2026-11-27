import logging
import os
import secrets
import time
import hashlib
import hmac
from typing import Dict
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Subscription, Role, PlanAbonnement
from app.schemas import RegisterDto, LoginDto, VerifyOtpDto, ResendOtpDto, AuthResponse, RegisterResponse, UserResponse
from app.security import hash_password, verify_password, create_access_token
from app.security_otp import generer_otp, verifier_otp

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/auth", tags=["Authentification"])

@router.post("/register", response_model=RegisterResponse)
def register(dto: RegisterDto, db: Session = Depends(get_db)):
    """
    Inscription d'un nouvel utilisateur.
    Démonstration clé : Instanciation directe d'un modèle SQLAlchemy 'User'
    et persistance dans PostgreSQL.
    """
    # 1. Vérification de l'unicité de l'email et du téléphone
    existing_email = db.query(User).filter(User.email == dto.email).first()
    if existing_email:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Cette adresse email est déjà utilisée."
        )

    existing_tel = db.query(User).filter(User.telephone == dto.telephone).first()
    if existing_tel:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="Ce numéro de téléphone est déjà utilisé."
        )

    # 2. Création d'une instance du modèle SQLAlchemy User
    nouvel_utilisateur = User(
        email=dto.email,
        telephone=dto.telephone,
        password_hash=hash_password(dto.password),
        nom=dto.nom,
        prenom=dto.prenom,
        role=Role.MEMBER,
        is_verified=False,
    )

    # 3. Liaison avec PostgreSQL via la session SQLAlchemy
    db.add(nouvel_utilisateur)
    db.commit()
    db.refresh(nouvel_utilisateur)

    # 4. Création d'une instance du modèle SQLAlchemy Subscription (Plan Gratuit)
    abonnement = Subscription(
        user_id=nouvel_utilisateur.id,
        plan=PlanAbonnement.GRATUIT,
        prix_mensuel=0,
        actif=True,
    )
    db.add(abonnement)
    db.commit()

    otp, _ = generer_otp(nouvel_utilisateur.id)
    logger.info(f"[SIMULATION OTP] Code sécurisé pour {nouvel_utilisateur.telephone} ({nouvel_utilisateur.email}) : {otp}")

    return RegisterResponse(
        userId=nouvel_utilisateur.id,
        message="Compte créé avec succès. Veuillez saisir le code OTP envoyé par SMS/Email."
    )

@router.post("/verify-otp", response_model=AuthResponse)
def verify_otp(dto: VerifyOtpDto, db: Session = Depends(get_db)):
    """
    Vérification sécurisée du code OTP de confirmation de compte.
    Protégé contre les attaques par force brute et par rejeu.
    """
    user = db.query(User).filter(User.id == dto.userId).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable.")

    valide, message = verifier_otp(user.id, dto.code)
    if not valide:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=message)

    user.is_verified = True
    db.commit()
    db.refresh(user)

    token = create_access_token({"sub": user.id, "email": user.email, "role": user.role.value})
    return AuthResponse(accessToken=token, user=UserResponse.model_validate(user))

@router.post("/resend-otp")
def resend_otp(dto: ResendOtpDto, db: Session = Depends(get_db)):
    """Renvoie un code OTP à l'utilisateur (avec limitation de fréquence)."""
    user = db.query(User).filter(User.id == dto.userId).first()
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Utilisateur introuvable.")

    otp, err = generer_otp(user.id)
    if err:
        raise HTTPException(status_code=status.HTTP_429_TOO_MANY_REQUESTS, detail=err)

    logger.info(f"[SIMULATION OTP RENVOI] Code pour {user.telephone} : {otp}")
    return {"message": "Nouveau code OTP envoyé avec succès."}

@router.post("/login", response_model=AuthResponse)
def login(dto: LoginDto, db: Session = Depends(get_db)):
    """Connexion d'un utilisateur existant avec email et mot de passe."""
    user = db.query(User).filter(User.email == dto.email).first()
    if not user or not verify_password(dto.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Identifiants incorrects (email ou mot de passe invalide)."
        )

    if user.is_blocked:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Votre compte a été bloqué par un administrateur."
        )

    if not user.is_verified:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Compte non vérifié. userId:{user.id}"
        )

    token = create_access_token({"sub": user.id, "email": user.email, "role": user.role.value})
    return AuthResponse(accessToken=token, user=UserResponse.model_validate(user))
