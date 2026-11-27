import uuid
import random
import string
from typing import List, Optional
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import (
    User,
    Tontine,
    TontineMember,
    DemandeAdhesion,
    Notification,
    Subscription,
    AuditLog,
    Role,
    PlanAbonnement,
    TontineStatus,
    MemberStatus,
    StatutDemandeAdhesion,
)
from app.schemas import (
    CreateTontineDto,
    RejoindreParCodeDto,
    RepondreDemandeDto,
    TontineResponse,
    TontineMemberResponse,
)
from app.security import get_current_user, require_roles
from app.config import settings
from app.utils.dates import prochain_jour

router = APIRouter(prefix="/tontines", tags=["Gestion des Tontines"])

def generer_code_invitation() -> str:
    """Génère un code d'invitation unique (ex: TNT-8492)."""
    chiffres = "".join(random.choices(string.digits, k=4))
    return f"TNT-{chiffres}"

@router.get("")
def lister_tontines(db: Session = Depends(get_db)):
    """Liste toutes les tontines publiques ouvertes aux adhésions."""
    tontines = db.query(Tontine).order_by(Tontine.created_at.desc()).all()
    return [
        {
            "id": t.id,
            "nom": t.nom,
            "description": t.description,
            "type": t.type.value,
            "montantCotisation": float(t.montant_cotisation),
            "frequence": t.frequence.value,
            "jourCotisation": t.jour_cotisation.value,
            "statut": t.statut.value,
            "cycleActuel": t.cycle_actuel,
            "nombreMaxMembres": t.nombre_max_membres,
            "codeInvitation": t.code_invitation,
            "nbMembresActuels": len(t.membres),
            "createdAt": t.created_at.isoformat() if t.created_at else None,
        }
        for t in tontines
    ]

@router.get("/admin/mes-tontines")
def mes_tontines_admin(
    current_user: User = Depends(require_roles([Role.ADMIN_TONTINE, Role.SUPER_ADMIN])),
    db: Session = Depends(get_db)
):
    """Liste les tontines créées par l'administrateur connecté."""
    query = db.query(Tontine)
    if current_user.role != Role.SUPER_ADMIN:
        query = query.filter(Tontine.createur_id == current_user.id)
    tontines = query.order_by(Tontine.created_at.desc()).all()

    result = []
    for t in tontines:
        nb_demandes = db.query(DemandeAdhesion).filter(
            DemandeAdhesion.tontine_id == t.id,
            DemandeAdhesion.statut == StatutDemandeAdhesion.EN_ATTENTE
        ).count()

        result.append({
            "id": t.id,
            "nom": t.nom,
            "description": t.description,
            "type": t.type.value,
            "montantCotisation": float(t.montant_cotisation),
            "frequence": t.frequence.value,
            "jourCotisation": t.jour_cotisation.value,
            "statut": t.statut.value,
            "cycleActuel": t.cycle_actuel,
            "nombreMaxMembres": t.nombre_max_membres,
            "codeInvitation": t.code_invitation,
            "nbMembresActuels": len(t.membres),
            "demandesEnAttente": nb_demandes,
            "createdAt": t.created_at.isoformat() if t.created_at else None,
        })
    return result

@router.post("", response_model=TontineResponse)
def creer_tontine(
    dto: CreateTontineDto,
    current_user: User = Depends(require_roles([Role.ADMIN_TONTINE, Role.SUPER_ADMIN])),
    db: Session = Depends(get_db)
):
    """
    Création d'une nouvelle tontine avec contrôle strict du forfait SaaS.
    """
    # 1. Vérification du quota du forfait d'abonnement SaaS
    if current_user.role != Role.SUPER_ADMIN:
        sub = db.query(Subscription).filter(Subscription.user_id == current_user.id).first()
        plan = sub.plan if (sub and sub.actif) else PlanAbonnement.GRATUIT
        limites = {PlanAbonnement.GRATUIT: 1, PlanAbonnement.STANDARD: 5, PlanAbonnement.PREMIUM: 9999}
        max_tontines = limites.get(plan, 1)

        nb_existantes = db.query(Tontine).filter(
            Tontine.createur_id == current_user.id,
            Tontine.statut.in_([TontineStatus.EN_ATTENTE, TontineStatus.ACTIVE])
        ).count()

        if nb_existantes >= max_tontines:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Votre forfait ({plan.value}) vous autorise au maximum {max_tontines} tontine(s) active(s). Mettez à niveau votre abonnement."
            )

    # 2. Génération d'un code d'invitation unique
    code = generer_code_invitation()
    while db.query(Tontine).filter(Tontine.code_invitation == code).first():
        code = generer_code_invitation()

    # 3. Instanciation du modèle SQLAlchemy Tontine
    nouvelle_tontine = Tontine(
        nom=dto.nom.strip(),
        description=dto.description.strip() if dto.description else None,
        type=dto.type,
        montant_cotisation=dto.montantCotisation,
        jour_cotisation=dto.jourCotisation,
        nombre_max_membres=dto.nombreMaxMembres,
        taux_commission=settings.TAUX_COMMISSION,
        statut=TontineStatus.EN_ATTENTE,
        cycle_actuel=1,
        code_invitation=code,
        createur_id=current_user.id,
    )
    db.add(nouvelle_tontine)
    db.commit()
    db.refresh(nouvelle_tontine)

    # 4. Ajout immédiat du créateur comme premier membre (ordre 1)
    premier_membre = TontineMember(
        tontine_id=nouvelle_tontine.id,
        user_id=current_user.id,
        ordre_passage=1,
        statut=MemberStatus.ACTIF,
    )
    db.add(premier_membre)
    db.commit()

    return TontineResponse.model_validate(nouvelle_tontine)

@router.post("/rejoindre-par-code")
def rejoindre_par_code(
    dto: RejoindreParCodeDto,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Permet de postuler à une tontine en saisissant son code d'invitation."""
    tontine = db.query(Tontine).filter(Tontine.code_invitation == dto.codeInvitation.strip()).first()
    if not tontine:
        raise HTTPException(status_code=404, detail="Code d'invitation introuvable.")

    return _creer_demande_adhesion(tontine, current_user, db)

@router.post("/{tontine_id}/rejoindre")
def rejoindre_par_id(
    tontine_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Envoie une demande d'adhésion pour une tontine donnée."""
    tontine = db.query(Tontine).filter(Tontine.id == tontine_id).first()
    if not tontine:
        raise HTTPException(status_code=404, detail="Tontine introuvable.")

    return _creer_demande_adhesion(tontine, current_user, db)

def _creer_demande_adhesion(tontine: Tontine, user: User, db: Session):
    if tontine.statut == TontineStatus.TERMINEE:
        raise HTTPException(status_code=400, detail="Cette tontine est terminée.")

    # Vérifier si déjà membre
    if any(m.user_id == user.id for m in tontine.membres):
        raise HTTPException(status_code=400, detail="Vous êtes déjà membre de cette tontine.")

    if len(tontine.membres) >= tontine.nombre_max_membres:
        raise HTTPException(status_code=400, detail="Cette tontine a atteint sa capacité maximale de membres.")

    # Vérifier si demande déjà envoyée
    existante = db.query(DemandeAdhesion).filter(
        DemandeAdhesion.tontine_id == tontine.id,
        DemandeAdhesion.user_id == user.id,
        DemandeAdhesion.statut == StatutDemandeAdhesion.EN_ATTENTE
    ).first()
    if existante:
        raise HTTPException(status_code=400, detail="Une demande d'adhésion est déjà en attente.")

    # Instanciation de DemandeAdhesion
    demande = DemandeAdhesion(
        tontine_id=tontine.id,
        user_id=user.id,
        statut=StatutDemandeAdhesion.EN_ATTENTE,
    )
    db.add(demande)

    # Notification au créateur de la tontine
    notif = Notification(
        user_id=tontine.createur_id,
        titre="Nouvelle demande d'adhésion",
        message=f"{user.prenom} {user.nom} souhaite rejoindre votre tontine '{tontine.nom}'.",
        type="INFO",
        lien=f"/admin-tontines?demandeId={demande.id}",
    )
    db.add(notif)
    db.commit()

    return {
        "success": True,
        "demandeId": demande.id,
        "tontine": {"id": tontine.id, "nom": tontine.nom},
        "message": "Votre demande d'adhésion a été transmise à l'administrateur de la tontine."
    }

@router.get("/demandes/{demande_id}")
def lire_demande(
    demande_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Consulte une demande d'adhésion avec contrôle strict des droits d'accès (Anti-IDOR).
    Seuls le demandeur, le créateur de la tontine ou le Super-Admin sont autorisés.
    """
    demande = db.query(DemandeAdhesion).filter(DemandeAdhesion.id == demande_id).first()
    if not demande:
        raise HTTPException(status_code=404, detail="Demande introuvable.")

    tontine = db.query(Tontine).filter(Tontine.id == demande.tontine_id).first()
    if not tontine:
        raise HTTPException(status_code=404, detail="Tontine associée introuvable.")

    # Protection IDOR
    if current_user.id != demande.user_id and tontine.createur_id != current_user.id and current_user.role != Role.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Accès non autorisé à cette demande.")

    user = db.query(User).filter(User.id == demande.user_id).first()
    return {
        "id": demande.id,
        "tontineId": demande.tontine_id,
        "statut": demande.statut.value,
        "motifRefus": demande.motif_refus,
        "createdAt": demande.created_at.isoformat() if demande.created_at else None,
        "demandeur": {
            "id": user.id if user else "",
            "nom": user.nom if user else "",
            "prenom": user.prenom if user else "",
            "telephone": user.telephone if user else "",
        },
        "tontine": {
            "id": tontine.id,
            "nom": tontine.nom,
        }
    }

@router.get("/{tontine_id}/demandes")
def lister_demandes(
    tontine_id: str,
    current_user: User = Depends(require_roles([Role.ADMIN_TONTINE, Role.SUPER_ADMIN])),
    db: Session = Depends(get_db)
):
    """
    Liste les demandes pour une tontine.
    Seul le créateur de la tontine ou le Super-Admin y a accès (Anti-IDOR).
    """
    tontine = db.query(Tontine).filter(Tontine.id == tontine_id).first()
    if not tontine:
        raise HTTPException(status_code=404, detail="Tontine introuvable.")

    if tontine.createur_id != current_user.id and current_user.role != Role.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Vous n'êtes pas le gestionnaire de cette tontine.")

    demandes = db.query(DemandeAdhesion).filter(DemandeAdhesion.tontine_id == tontine_id).all()
    result = []
    for d in demandes:
        u = db.query(User).filter(User.id == d.user_id).first()
        result.append({
            "id": d.id,
            "statut": d.statut.value,
            "motifRefus": d.motif_refus,
            "createdAt": d.created_at.isoformat() if d.created_at else None,
            "user": {
                "id": u.id if u else "",
                "nom": u.nom if u else "",
                "prenom": u.prenom if u else "",
                "telephone": u.telephone if u else "",
            }
        })
    return result

@router.post("/demandes/{demande_id}/accepter")
def accepter_demande(
    demande_id: str,
    current_user: User = Depends(require_roles([Role.ADMIN_TONTINE, Role.SUPER_ADMIN])),
    db: Session = Depends(get_db)
):
    """
    Accepte une demande d'adhésion et intègre le membre.
    Contrôle de propriété (Anti-IDOR) et vérification d'idempotence.
    """
    demande = db.query(DemandeAdhesion).filter(DemandeAdhesion.id == demande_id).first()
    if not demande:
        raise HTTPException(status_code=404, detail="Demande introuvable.")

    tontine = db.query(Tontine).filter(Tontine.id == demande.tontine_id).first()
    if not tontine:
        raise HTTPException(status_code=404, detail="Tontine introuvable.")

    # Contrôle de propriété
    if tontine.createur_id != current_user.id and current_user.role != Role.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Vous n'êtes pas autorisé à gérer les adhésions de cette tontine.")

    if demande.statut != StatutDemandeAdhesion.EN_ATTENTE:
        raise HTTPException(status_code=400, detail="Cette demande a déjà été traitée.")

    if len(tontine.membres) >= tontine.nombre_max_membres:
        raise HTTPException(status_code=400, detail="Cette tontine a déjà atteint sa capacité maximale de membres.")

    # Attribution du prochain ordre de passage disponible
    prochain_ordre = len(tontine.membres) + 1

    # Instanciation de TontineMember
    nouveau_membre = TontineMember(
        tontine_id=tontine.id,
        user_id=demande.user_id,
        ordre_passage=prochain_ordre,
        statut=MemberStatus.ACTIF,
    )
    db.add(nouveau_membre)

    demande.statut = StatutDemandeAdhesion.ACCEPTEE
    demande.traitee_at = datetime.now(timezone.utc)
    demande.traitee_par_id = current_user.id

    # Notification au demandeur
    notif = Notification(
        user_id=demande.user_id,
        titre="Demande acceptée !",
        message=f"Félicitations, votre adhésion à la tontine '{tontine.nom}' a été acceptée (Votre tour : {prochain_ordre}).",
        type="SUCCESS",
        lien=f"/tontines/{tontine.id}",
    )
    db.add(notif)
    db.commit()

    return {"success": True, "message": "Membre ajouté à la tontine avec succès."}

@router.post("/demandes/{demande_id}/refuser")
def refuser_demande(
    demande_id: str,
    dto: RepondreDemandeDto,
    current_user: User = Depends(require_roles([Role.ADMIN_TONTINE, Role.SUPER_ADMIN])),
    db: Session = Depends(get_db)
):
    """
    Refuse une demande d'adhésion avec contrôle de propriété (Anti-IDOR).
    """
    demande = db.query(DemandeAdhesion).filter(DemandeAdhesion.id == demande_id).first()
    if not demande:
        raise HTTPException(status_code=404, detail="Demande introuvable.")

    tontine = db.query(Tontine).filter(Tontine.id == demande.tontine_id).first()
    if not tontine:
        raise HTTPException(status_code=404, detail="Tontine introuvable.")

    # Contrôle de propriété
    if tontine.createur_id != current_user.id and current_user.role != Role.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Vous n'êtes pas autorisé à gérer les adhésions de cette tontine.")

    if demande.statut != StatutDemandeAdhesion.EN_ATTENTE:
        raise HTTPException(status_code=400, detail="Cette demande a déjà été traitée.")

    demande.statut = StatutDemandeAdhesion.REFUSEE
    demande.motif_refus = dto.motifRefus.strip() if dto.motifRefus else None
    demande.traitee_at = datetime.now(timezone.utc)
    demande.traitee_par_id = current_user.id

    # Notification au demandeur
    notif = Notification(
        user_id=demande.user_id,
        titre="Demande non retenue",
        message=f"Votre demande d'adhésion a été refusée. {f'Motif: {demande.motif_refus}' if demande.motif_refus else ''}",
        type="WARNING",
    )
    db.add(notif)
    db.commit()

    return {"success": True, "message": "Demande refusée."}

@router.post("/{tontine_id}/demarrer")
def demarrer_tontine(
    tontine_id: str,
    current_user: User = Depends(require_roles([Role.ADMIN_TONTINE, Role.SUPER_ADMIN])),
    db: Session = Depends(get_db)
):
    """
    Démarre le cycle d'une tontine avec contrôle de propriété (Anti-IDOR).
    """
    tontine = db.query(Tontine).filter(Tontine.id == tontine_id).first()
    if not tontine:
        raise HTTPException(status_code=404, detail="Tontine introuvable.")

    # Contrôle de propriété
    if tontine.createur_id != current_user.id and current_user.role != Role.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Vous n'êtes pas le gestionnaire de cette tontine.")

    if tontine.statut != TontineStatus.EN_ATTENTE:
        raise HTTPException(status_code=400, detail="Seule une tontine en attente peut être démarrée.")

    if len(tontine.membres) < 2:
        raise HTTPException(status_code=400, detail="Au moins 2 membres sont requis pour démarrer la tontine.")

    maintenant = datetime.now(timezone.utc)
    date_premiere_echeance = prochain_jour(maintenant, tontine.jour_cotisation)

    tontine.statut = TontineStatus.ACTIVE
    tontine.date_debut = date_premiere_echeance
    tontine.cycle_actuel = 1

    # Audit log
    audit = AuditLog(
        action="TONTINE_STARTED",
        cible=tontine.id,
        details=f"Tontine {tontine.nom} démarrée par {current_user.email} avec {len(tontine.membres)} membres.",
        acteur_id=current_user.id,
    )
    db.add(audit)

    # Notifier tous les membres
    for m in tontine.membres:
        notif = Notification(
            user_id=m.user_id,
            titre="Démarrage de la tontine !",
            message=f"La tontine '{tontine.nom}' est désormais active ! Première échéance : {date_premiere_echeance.strftime('%d/%m/%Y')}.",
            type="SUCCESS",
            lien=f"/tontines/{tontine.id}",
        )
        db.add(notif)
    db.commit()

    return {"success": True, "message": "La tontine a démarré avec succès."}

@router.post("/{tontine_id}/membres/{user_id}/exclure")
def exclure_membre(
    tontine_id: str,
    user_id: str,
    current_user: User = Depends(require_roles([Role.ADMIN_TONTINE, Role.SUPER_ADMIN])),
    db: Session = Depends(get_db)
):
    """
    Exclut un membre d'une tontine avec contrôle de propriété (Anti-IDOR) et audit log.
    """
    tontine = db.query(Tontine).filter(Tontine.id == tontine_id).first()
    if not tontine:
        raise HTTPException(status_code=404, detail="Tontine introuvable.")

    # Contrôle de propriété
    if tontine.createur_id != current_user.id and current_user.role != Role.SUPER_ADMIN:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Vous n'êtes pas le gestionnaire de cette tontine.")

    if user_id == tontine.createur_id:
        raise HTTPException(status_code=400, detail="Le créateur de la tontine ne peut pas s'auto-exclure.")

    membre = db.query(TontineMember).filter(
        TontineMember.tontine_id == tontine_id,
        TontineMember.user_id == user_id
    ).first()
    if not membre:
        raise HTTPException(status_code=404, detail="Membre introuvable dans cette tontine.")

    membre.statut = MemberStatus.EXCLU

    # Audit log
    audit = AuditLog(
        action="MEMBER_EXCLUDED",
        cible=user_id,
        details=f"Membre {user_id} exclu de la tontine '{tontine.nom}' par {current_user.email}",
        acteur_id=current_user.id,
    )
    db.add(audit)
    db.commit()
    return {"success": True, "message": "Membre exclu de la tontine."}
