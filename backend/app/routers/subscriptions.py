from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import User, Subscription, Transaction, Role, PlanAbonnement, TransactionType, TransactionStatus
from app.schemas import ChangerPlanDto, SubscriptionResponse
from app.security import get_current_user, require_roles
from app.config import settings

router = APIRouter(prefix="/subscriptions", tags=["Abonnements SaaS"])

@router.get("", response_model=SubscriptionResponse)
def get_abonnement(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Récupère l'abonnement SaaS de l'utilisateur connecté."""
    sub = db.query(Subscription).filter(Subscription.user_id == current_user.id).first()
    if not sub:
        # Création automatique de l'abonnement gratuit par défaut
        sub = Subscription(
            user_id=current_user.id,
            plan=PlanAbonnement.GRATUIT,
            prix_mensuel=0,
            actif=True,
        )
        db.add(sub)
        db.commit()
        db.refresh(sub)
    return SubscriptionResponse.model_validate(sub)

@router.get("/plans")
def get_plans():
    """Retourne la grille des forfaits d'abonnement SaaS."""
    return [
        {
            "plan": PlanAbonnement.GRATUIT.value,
            "nom": "Plan Gratuit",
            "prixMensuel": 0,
            "limiteTontines": 1,
            "description": "Idéal pour découvrir la plateforme et gérer sa première tontine.",
        },
        {
            "plan": PlanAbonnement.STANDARD.value,
            "nom": "Plan Standard",
            "prixMensuel": 5000,
            "limiteTontines": 5,
            "description": "Pour les gestionnaires gérant plusieurs cercles ou associations.",
        },
        {
            "plan": PlanAbonnement.PREMIUM.value,
            "nom": "Plan Premium",
            "prixMensuel": 15000,
            "limiteTontines": 999,
            "description": "Gestion illimitée, support prioritaire et fonctionnalités avancées.",
        },
    ]

@router.post("/changer-plan", response_model=SubscriptionResponse)
def changer_plan(
    dto: ChangerPlanDto,
    current_user: User = Depends(require_roles([Role.ADMIN_TONTINE, Role.SUPER_ADMIN])),
    db: Session = Depends(get_db)
):
    """
    Modifie le forfait SaaS de l'administrateur de tontine.
    Instancie une Transaction ABONNEMENT si le forfait est payant.
    """
    sub = db.query(Subscription).filter(Subscription.user_id == current_user.id).first()
    if not sub:
        sub = Subscription(user_id=current_user.id)
        db.add(sub)

    prix_map = {
        PlanAbonnement.GRATUIT: 0,
        PlanAbonnement.STANDARD: 5000,
        PlanAbonnement.PREMIUM: 15000,
    }
    nouveau_prix = prix_map.get(dto.plan, 0)
    if nouveau_prix > 0:
        raise HTTPException(
            status_code=402,
            detail="Paiement confirmé requis pour activer un forfait payant.",
        )

    sub.plan = dto.plan
    sub.prix_mensuel = nouveau_prix
    sub.actif = True
    sub.date_debut = datetime.now(timezone.utc)
    sub.date_fin = datetime.now(timezone.utc) + timedelta(days=30) if nouveau_prix > 0 else None

    db.commit()
    db.refresh(sub)
    return SubscriptionResponse.model_validate(sub)

@router.post("/renouveler", response_model=SubscriptionResponse)
def renouveler_abonnement(
    current_user: User = Depends(require_roles([Role.ADMIN_TONTINE, Role.SUPER_ADMIN])),
    db: Session = Depends(get_db)
):
    """Renouvelle le forfait payant en cours pour 30 jours supplémentaires."""
    sub = db.query(Subscription).filter(Subscription.user_id == current_user.id).first()
    if not sub or sub.plan == PlanAbonnement.GRATUIT:
        raise HTTPException(status_code=400, detail="Aucun forfait payant actif à renouveler.")

    raise HTTPException(
        status_code=402,
        detail="Renouvellement disponible uniquement après confirmation d’un paiement réel.",
    )

@router.post("/annuler", response_model=SubscriptionResponse)
def annuler_abonnement(
    current_user: User = Depends(require_roles([Role.ADMIN_TONTINE, Role.SUPER_ADMIN])),
    db: Session = Depends(get_db)
):
    """Annule l'abonnement payant et repasse sur le plan gratuit."""
    sub = db.query(Subscription).filter(Subscription.user_id == current_user.id).first()
    if sub:
        sub.plan = PlanAbonnement.GRATUIT
        sub.prix_mensuel = 0
        sub.date_fin = None
        db.commit()
        db.refresh(sub)
    return SubscriptionResponse.model_validate(sub)
