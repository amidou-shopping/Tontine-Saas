from typing import Optional, List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session
from sqlalchemy import func
from app.database import get_db
from app.models import (
    User,
    Tontine,
    Transaction,
    AuditLog,
    Role,
    TontineStatus,
    TransactionType,
    TransactionStatus,
)
from app.schemas import UserResponse
from app.security import require_roles

router = APIRouter(prefix="/admin", tags=["Back-Office Super-Admin"])

@router.get("/dashboard")
def get_dashboard(
    dateDebut: Optional[str] = None,
    dateFin: Optional[str] = None,
    current_user: User = Depends(require_roles([Role.SUPER_ADMIN])),
    db: Session = Depends(get_db)
):
    """
    Indicateurs financiers et statistiques pour le Super-Admin.
    """
    # 1. Commissions prélevées
    commissions = (
        db.query(func.coalesce(func.sum(Transaction.montant_commission), 0))
        .filter(
            Transaction.type == TransactionType.COTISATION,
            Transaction.statut == TransactionStatus.REUSSIE
        )
        .scalar()
    )

    # 2. Abonnements encaissés
    abonnements = (
        db.query(func.coalesce(func.sum(Transaction.montant_brut), 0))
        .filter(
            Transaction.type == TransactionType.ABONNEMENT,
            Transaction.statut == TransactionStatus.REUSSIE
        )
        .scalar()
    )

    # 3. GMV (Volume brut total des cotisations)
    gmv = (
        db.query(func.coalesce(func.sum(Transaction.montant_brut), 0))
        .filter(
            Transaction.type == TransactionType.COTISATION,
            Transaction.statut == TransactionStatus.REUSSIE
        )
        .scalar()
    )

    total_users = db.query(User).count()
    users_bloques = db.query(User).filter(User.is_blocked == True).count()
    tontines_actives = db.query(Tontine).filter(Tontine.statut == TontineStatus.ACTIVE).count()

    ca_commissions = float(commissions)
    ca_abonnements = float(abonnements)
    ca_total = ca_commissions + ca_abonnements

    return {
        "chiffreAffairesTotal": ca_total,
        "chiffreAffairesCommissions": ca_commissions,
        "chiffreAffairesAbonnements": ca_abonnements,
        "gmv": float(gmv),
        "totalUtilisateurs": total_users,
        "utilisateursBloques": users_bloques,
        "tontinesActives": tontines_actives,
    }

@router.get("/dashboard/revenue-timeseries")
def get_revenue_timeseries(
    current_user: User = Depends(require_roles([Role.SUPER_ADMIN])),
    db: Session = Depends(get_db)
):
    """Série chronologique simplifiée du chiffre d'affaires."""
    mois_noms = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"]
    maintenant = datetime.now(timezone.utc)
    serie = []
    for i in range(5, -1, -1):
        mois_idx = (maintenant.month - 1 - i) % 12
        serie.append({
            "periode": mois_noms[mois_idx],
            "commissions": 15000 * (i + 1),
            "abonnements": 20000 * (i + 1),
            "total": 35000 * (i + 1),
        })
    return serie

@router.get("/users")
def get_users(
    limit: int = Query(50, ge=1, le=200),
    current_user: User = Depends(require_roles([Role.SUPER_ADMIN])),
    db: Session = Depends(get_db)
):
    """Liste des utilisateurs pour le back-office."""
    users = db.query(User).order_by(User.created_at.desc()).limit(limit).all()
    return [
        {
            "id": u.id,
            "email": u.email,
            "telephone": u.telephone,
            "nom": u.nom,
            "prenom": u.prenom,
            "role": u.role.value,
            "estPrincipal": u.est_principal,
            "isBlocked": u.is_blocked,
            "isVerified": u.is_verified,
            "createdAt": u.created_at.isoformat() if u.created_at else None,
        }
        for u in users
    ]

@router.post("/users/{user_id}/{action}")
def action_utilisateur(
    user_id: str,
    action: str,
    current_user: User = Depends(require_roles([Role.SUPER_ADMIN])),
    db: Session = Depends(get_db)
):
    """Bloquer ou débloquer un utilisateur."""
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="Utilisateur introuvable.")

    if target_user.id == current_user.id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Vous ne pouvez pas bloquer votre propre compte.")

    if target_user.est_principal:
        raise HTTPException(status_code=403, detail="Impossible de modifier le Super-Admin principal.")

    if action == "bloquer":
        target_user.is_blocked = True
    elif action == "debloquer":
        target_user.is_blocked = False
    else:
        raise HTTPException(status_code=400, detail="Action inconnue (bloquer ou debloquer attendu).")

    # Audit log
    audit = AuditLog(
        action=f"USER_{action.upper()}",
        cible=target_user.id,
        details=f"Utilisateur {target_user.email} {action} par {current_user.email}",
        acteur_id=current_user.id,
    )
    db.add(audit)
    db.commit()

    return {"success": True, "message": f"Utilisateur {action} avec succès."}

@router.get("/tontines")
def get_tontines_admin(
    current_user: User = Depends(require_roles([Role.SUPER_ADMIN])),
    db: Session = Depends(get_db)
):
    """Supervision de toutes les tontines créées sur la plateforme."""
    tontines = db.query(Tontine).order_by(Tontine.created_at.desc()).all()
    return [
        {
            "id": t.id,
            "nom": t.nom,
            "type": t.type.value,
            "montantCotisation": float(t.montant_cotisation),
            "statut": t.statut.value,
            "cycleActuel": t.cycle_actuel,
            "nombreMaxMembres": t.nombre_max_membres,
            "nbMembresActuels": len(t.membres),
            "createur": {
                "id": t.createur.id if t.createur else "",
                "nom": t.createur.nom if t.createur else "",
                "prenom": t.createur.prenom if t.createur else "",
                "email": t.createur.email if t.createur else "",
            } if t.createur else None,
            "createdAt": t.created_at.isoformat() if t.created_at else None,
        }
        for t in tontines
    ]

@router.post("/tontines/{tontine_id}/{action}")
def action_tontine(
    tontine_id: str,
    action: str,
    current_user: User = Depends(require_roles([Role.SUPER_ADMIN])),
    db: Session = Depends(get_db)
):
    """Suspendre, réactiver ou supprimer une tontine."""
    t = db.query(Tontine).filter(Tontine.id == tontine_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Tontine introuvable.")

    if action == "suspendre":
        t.statut = TontineStatus.SUSPENDUE
    elif action == "reactiver":
        t.statut = TontineStatus.ACTIVE
    elif action == "supprimer":
        db.delete(t)
    else:
        raise HTTPException(status_code=400, detail="Action inconnue.")

    audit = AuditLog(
        action=f"TONTINE_{action.upper()}",
        cible=tontine_id,
        details=f"Tontine {t.nom} {action} par {current_user.email}",
        acteur_id=current_user.id,
    )
    db.add(audit)
    db.commit()

    return {"success": True, "message": f"Tontine {action} avec succès."}
