import re
import uuid
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
    Transaction,
    Notification,
    PendingPayment,
    AuditLog,
    Role,
    TontineStatus,
    MemberStatus,
    TransactionType,
    TransactionStatus,
    PaymentProvider,
)
from app.schemas import (
    UserResponse,
    UpdateProfilDto,
    PayerCotisationDto,
    InitierPassageAdminDto,
    ConfirmerPassageAdminDto,
    TransactionResponse,
    NotificationResponse,
)
from app.security import get_current_user
from app.config import settings
from app.utils.dates import date_du_tour, prochain_jour
from app.utils.finances import calculer_commission, calculer_amende

router = APIRouter(prefix="/member", tags=["Espace Membre"])

@router.get("/profil", response_model=UserResponse)
def get_profil(current_user: User = Depends(get_current_user)):
    """Récupère les informations du profil de l'utilisateur connecté."""
    return UserResponse.model_validate(current_user)

@router.patch("/profil", response_model=UserResponse)
def update_profil(
    dto: UpdateProfilDto,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Mise à jour des coordonnées personnelles."""
    if dto.nom is not None:
        current_user.nom = dto.nom.strip()
    if dto.prenom is not None:
        current_user.prenom = dto.prenom.strip()
    if dto.telephone is not None:
        tel = dto.telephone.strip()
        if not re.match(r"^\+221\d{9}$", tel):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Numéro sénégalais requis (+221XXXXXXXXX).")
        existant = db.query(User).filter(User.telephone == tel, User.id != current_user.id).first()
        if existant:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Ce numéro de téléphone est déjà utilisé.")
        current_user.telephone = tel
    db.commit()
    db.refresh(current_user)
    return UserResponse.model_validate(current_user)

@router.get("/support-contacts")
def get_support_contacts():
    """Retourne la liste des contacts d'assistance WhatsApp configurés."""
    return [
        {"nom": settings.SUPPORT_1_NAME, "telephone": settings.SUPPORT_1_PHONE},
        {"nom": settings.SUPPORT_2_NAME, "telephone": settings.SUPPORT_2_PHONE},
        {"nom": settings.SUPPORT_3_NAME, "telephone": settings.SUPPORT_3_PHONE},
    ]

@router.get("/devenir-admin/tarif")
def get_tarif_devenir_admin():
    """Retourne les frais uniques de passage au rôle ADMIN_TONTINE."""
    return {"fraisPassageAdminFcfa": settings.FRAIS_PASSAGE_ADMIN}

@router.post("/devenir-admin")
def initier_devenir_admin(
    dto: InitierPassageAdminDto,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Initie le paiement pour devenir gestionnaire de tontine.
    Crée une instance de PendingPayment liée à PostgreSQL.
    """
    ref_interne = f"ADMIN_PASS_{current_user.id}_{int(datetime.now(timezone.utc).timestamp())}"
    
    paiement = PendingPayment(
        type="PASSAGE_ADMIN",
        user_id=current_user.id,
        provider=dto.provider,
        reference_interne=ref_interne,
        montant_brut=settings.FRAIS_PASSAGE_ADMIN,
        statut="EN_ATTENTE",
    )
    db.add(paiement)
    db.commit()

    return {
        "referenceInterne": ref_interne,
        "montant": settings.FRAIS_PASSAGE_ADMIN,
        "provider": dto.provider.value,
        "message": "Paiement initié. Confirmez pour valider votre statut d'administrateur de tontine."
    }

@router.post("/devenir-admin/confirmer")
def confirmer_devenir_admin(
    dto: ConfirmerPassageAdminDto,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Confirme le passage au rôle ADMIN_TONTINE."""
    paiement = db.query(PendingPayment).filter(
        PendingPayment.reference_interne == dto.referenceInterne,
        PendingPayment.user_id == current_user.id
    ).first()

    if not paiement:
        raise HTTPException(status_code=404, detail="Paiement introuvable.")
    if paiement.statut != "REUSSIE" or not paiement.webhook_recu:
        raise HTTPException(status_code=409, detail="Paiement non confirmé par la passerelle.")

    paiement.statut = "REUSSIE"
    paiement.webhook_recu = True
    paiement.date_webhook = datetime.now(timezone.utc)

    # Création de l'instance Transaction
    tx = Transaction(
        type=TransactionType.PASSAGE_ADMIN,
        statut=TransactionStatus.REUSSIE,
        provider=paiement.provider,
        montant_brut=paiement.montant_brut,
        montant_commission=paiement.montant_brut,
        montant_net=0,
        user_id=current_user.id,
    )
    db.add(tx)

    # Mise à niveau du rôle de l'utilisateur
    current_user.role = Role.ADMIN_TONTINE
    db.commit()

    return {
        "success": True,
        "nouveauRole": current_user.role.value,
        "message": "Félicitations, vous êtes désormais Administrateur de Tontine !"
    }

@router.get("/demandes")
def get_mes_demandes(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Liste les demandes d'adhésion envoyées par le membre."""
    demandes = db.query(DemandeAdhesion).filter(DemandeAdhesion.user_id == current_user.id).order_by(DemandeAdhesion.created_at.desc()).all()
    result = []
    for d in demandes:
        tontine = db.query(Tontine).filter(Tontine.id == d.tontine_id).first()
        result.append({
            "id": d.id,
            "tontineId": d.tontine_id,
            "statut": d.statut.value,
            "motifRefus": d.motif_refus,
            "createdAt": d.created_at.isoformat() if d.created_at else None,
            "tontine": {
                "id": tontine.id if tontine else "",
                "nom": tontine.nom if tontine else "Tontine inconnue",
                "codeInvitation": tontine.code_invitation if tontine else "",
                "statut": tontine.statut.value if tontine else "INCONNUE",
            } if tontine else None
        })
    return result

@router.get("/tontines")
def get_mes_tontines(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Récupère la liste des tontines actives auxquelles l'utilisateur participe."""
    participations = (
        db.query(TontineMember)
        .join(Tontine, Tontine.id == TontineMember.tontine_id)
        .filter(TontineMember.user_id == current_user.id, Tontine.statut == TontineStatus.ACTIVE)
        .all()
    )

    tontines_list = []
    for m in participations:
        t = m.tontine
        # Vérifier si la cotisation du cycle actuel a été payée
        cotisation_payee = (
            db.query(Transaction)
            .filter(
                Transaction.tontine_member_id == m.id,
                Transaction.type == TransactionType.COTISATION,
                Transaction.statut == TransactionStatus.REUSSIE,
                Transaction.cycle_concerne == t.cycle_actuel,
            )
            .first()
        )

        statut_cotisation = "PAYE" if cotisation_payee else "EN_ATTENTE"
        echeance = date_du_tour(t.date_debut, t.cycle_actuel) if t.date_debut else datetime.now(timezone.utc)

        tontines_list.append({
            "id": t.id,
            "nom": t.nom,
            "description": t.description,
            "montantCotisation": float(t.montant_cotisation),
            "frequence": t.frequence.value,
            "prochainEcheance": echeance.isoformat() if echeance else None,
            "monTour": m.ordre_passage,
            "cycleActuel": t.cycle_actuel,
            "statutCotisation": statut_cotisation,
            "arriere": None
        })

    return tontines_list

@router.get("/tontines/{tontine_id}")
def get_tontine_details(
    tontine_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Consulte les détails d'une tontine spécifique."""
    tontine = db.query(Tontine).filter(Tontine.id == tontine_id).first()
    if not tontine:
        raise HTTPException(status_code=404, detail="Tontine introuvable.")

    membre = db.query(TontineMember).filter(
        TontineMember.tontine_id == tontine_id,
        TontineMember.user_id == current_user.id
    ).first()

    membres_list = []
    for m in tontine.membres:
        u = db.query(User).filter(User.id == m.user_id).first()
        membres_list.append({
            "id": m.id,
            "userId": m.user_id,
            "ordrePassage": m.ordre_passage,
            "statut": m.statut.value,
            "aDejaRecu": m.a_deja_recu,
            "prenom": u.prenom if u else "",
            "nom": u.nom if u else "",
        })

    return {
        "id": tontine.id,
        "nom": tontine.nom,
        "description": tontine.description,
        "montantCotisation": float(tontine.montant_cotisation),
        "frequence": tontine.frequence.value,
        "jourCotisation": tontine.jour_cotisation.value,
        "statut": tontine.statut.value,
        "cycleActuel": tontine.cycle_actuel,
        "nombreMaxMembres": tontine.nombre_max_membres,
        "codeInvitation": tontine.code_invitation,
        "monTour": membre.ordre_passage if membre else None,
        "membres": membres_list,
    }

@router.post("/tontines/{tontine_id}/payer")
def payer_cotisation(
    tontine_id: str,
    dto: PayerCotisationDto,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    Règlement d'une cotisation ou d'un arriéré par un membre.
    Instancie le modèle SQLAlchemy Transaction pour liaison directe avec PostgreSQL.
    """
    tontine = db.query(Tontine).filter(Tontine.id == tontine_id).first()
    if not tontine:
        raise HTTPException(status_code=404, detail="Tontine introuvable.")

    if tontine.statut != TontineStatus.ACTIVE:
        raise HTTPException(status_code=400, detail="Cette tontine n'est pas active pour recevoir des cotisations.")

    membre = db.query(TontineMember).filter(
        TontineMember.tontine_id == tontine_id,
        TontineMember.user_id == current_user.id
    ).first()
    if not membre:
        raise HTTPException(status_code=403, detail="Vous ne faites pas partie de cette tontine.")

    if membre.statut == MemberStatus.EXCLU:
        raise HTTPException(status_code=403, detail="Vous avez été exclu de cette tontine.")

    cycle = dto.cycleConcerne or tontine.cycle_actuel

    # Protection contre le double-paiement (Anti-Double Spending)
    deja_paye = db.query(Transaction).filter(
        Transaction.tontine_member_id == membre.id,
        Transaction.cycle_concerne == cycle,
        Transaction.type == TransactionType.COTISATION,
        Transaction.statut == TransactionStatus.REUSSIE,
    ).first()
    if deja_paye:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"La cotisation pour le tour {cycle} a déjà été réglée."
        )

    pending_en_cours = db.query(PendingPayment).filter(
        PendingPayment.tontine_member_id == membre.id,
        PendingPayment.cycle_concerne == cycle,
        PendingPayment.statut == "EN_ATTENTE",
    ).first()
    if pending_en_cours:
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"Un paiement pour le tour {cycle} est déjà en cours de traitement."
        )

    montant_brut = float(tontine.montant_cotisation)
    commission = calculer_commission(montant_brut, float(tontine.taux_commission))
    montant_net = montant_brut - commission

    # Enregistrement de la transaction réussie
    nouvelle_transaction = Transaction(
        type=TransactionType.COTISATION,
        statut=TransactionStatus.REUSSIE,
        provider=dto.provider,
        reference_externe=f"PAY-{uuid.uuid4().hex[:10].upper()}",
        montant_brut=montant_brut,
        montant_commission=commission,
        montant_net=montant_net,
        user_id=current_user.id,
        tontine_id=tontine.id,
        tontine_member_id=membre.id,
        cycle_concerne=cycle,
    )
    db.add(nouvelle_transaction)

    # Notification de confirmation
    notif = Notification(
        user_id=current_user.id,
        titre="Cotisation validée",
        message=f"Votre cotisation de {int(montant_brut)} FCFA pour la tontine '{tontine.nom}' (cycle {cycle}) a été réglée avec succès.",
        type="SUCCESS",
        lien=f"/tontines/{tontine.id}",
    )
    db.add(notif)
    db.commit()

    return {
        "success": True,
        "transactionId": nouvelle_transaction.id,
        "statut": "REUSSIE",
        "montant": montant_brut,
        "cycle": cycle,
        "message": "Cotisation validée avec succès."
    }

@router.get("/transactions")
def get_mes_transactions(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Liste l'historique des transactions du membre."""
    transactions = (
        db.query(Transaction)
        .filter(Transaction.user_id == current_user.id)
        .order_by(Transaction.created_at.desc())
        .all()
    )
    return [
        {
            "id": tx.id,
            "type": tx.type.value,
            "statut": tx.statut.value,
            "provider": tx.provider.value if tx.provider else None,
            "montantBrut": float(tx.montant_brut),
            "montantCommission": float(tx.montant_commission),
            "montantNet": float(tx.montant_net),
            "tontineId": tx.tontine_id,
            "cycleConcerne": tx.cycle_concerne,
            "createdAt": tx.created_at.isoformat() if tx.created_at else None,
        }
        for tx in transactions
    ]

@router.get("/notifications")
def get_mes_notifications(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Liste les notifications reçues par l'utilisateur."""
    notifications = (
        db.query(Notification)
        .filter(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
        .all()
    )
    return [
        {
            "id": n.id,
            "titre": n.titre,
            "message": n.message,
            "type": n.type,
            "lien": n.lien,
            "lue": n.lue,
            "createdAt": n.created_at.isoformat() if n.created_at else None,
        }
        for n in notifications
    ]

@router.post("/notifications/{notification_id}/lu")
def marquer_notification_lue(
    notification_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Marque une notification comme lue."""
    notif = db.query(Notification).filter(
        Notification.id == notification_id,
        Notification.user_id == current_user.id
    ).first()
    if notif:
        notif.lue = True
        db.commit()
    return {"success": True}
