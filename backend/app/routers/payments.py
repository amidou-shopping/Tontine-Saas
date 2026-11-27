import logging
import hmac
import hashlib
import re
import time
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, Request, HTTPException, status
from sqlalchemy.orm import Session
from app.database import get_db
from app.models import (
    PendingPayment,
    Transaction,
    User,
    Tontine,
    TontineMember,
    AuditLog,
    TransactionType,
    TransactionStatus,
    Role,
)
from app.config import settings
from app.utils.finances import calculer_commission

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/payments", tags=["Passerelles de Paiement"])

WEBHOOK_MAX_AGE_SECONDS = 5 * 60  # 5 minutes max pour prévenir le rejeu

def verifier_signature(provider: str, raw_body: bytes, headers: dict) -> bool:
    """Vérifie la signature HMAC-SHA256 sur les octets bruts du webhook."""
    provider_key = provider.lower()
    secret_map = {
        "wave": settings.WAVE_WEBHOOK_SECRET,
        "orange_money": settings.ORANGE_MONEY_WEBHOOK_SECRET,
        "paytech": settings.PAYTECH_API_SECRET,
        "paydunya": settings.PAYTECH_API_SECRET,
    }
    secret = secret_map.get(provider_key)
    if not secret:
        logger.error(f"Aucun secret webhook configuré pour {provider}.")
        return False

    # Recherche de l'en-tête de signature
    sig_header = None
    for name in ["x-signature", "wave-signature", "x-paytech-signature", "signature"]:
        if name in headers:
            sig_header = headers[name]
            break

    if not sig_header:
        return False

    # Vérification anti-rejeu sur l'horodatage si présent (format t=timestamp,v1=signature)
    match_t = re.search(r"(?:^|,)t=(\d{10,13})(?:,|$)", sig_header)
    if match_t:
        ts = int(match_t.group(1))
        if ts > 10_000_000_000:
            ts = ts // 1000
        if abs(int(time.time()) - ts) > WEBHOOK_MAX_AGE_SECONDS:
            logger.warning("Rejet de webhook : horodatage trop ancien.")
            return False

    # Calcul de la signature attendue
    expected_hex = hmac.new(secret.encode("utf-8"), raw_body, hashlib.sha256).hexdigest()

    # Extraction des signatures candidates
    candidates = re.findall(r"(?:sha256=|v1=)?([a-f0-9]{64})", sig_header, re.IGNORECASE)
    if not candidates:
        candidates = [sig_header.strip()]

    return any(hmac.compare_digest(c.lower(), expected_hex.lower()) for c in candidates)

@router.post("/webhook/{provider}")
async def recevoir_webhook(
    provider: str,
    request: Request,
    db: Session = Depends(get_db)
):
    """
    Réception sécurisée des webhooks de paiement avec vérification HMAC et protection anti-rejeu.
    """
    raw_body = await request.body()
    try:
        body = await request.json()
    except Exception:
        raise HTTPException(status_code=400, detail="Corps JSON invalide.")

    # 1. Vérification cryptographique de la signature HMAC
    headers_lower = {k.lower(): v for k, v in request.headers.items()}
    if not verifier_signature(provider, raw_body, headers_lower):
        logger.warning(f"Signature invalide reçue pour le webhook {provider}.")
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Signature de webhook invalide.")

    # 2. Récupération de la référence interne
    ref_interne = body.get("referenceInterne") or body.get("client_reference") or body.get("ref_command")
    if not ref_interne:
        return {"status": "ignored", "message": "Aucune référence interne détectée."}

    pending = db.query(PendingPayment).filter(PendingPayment.reference_interne == ref_interne).first()
    if not pending:
        logger.warning(f"Paiement en attente introuvable pour la référence : {ref_interne}")
        return {"status": "not_found"}

    # Idempotence : si déjà traité, ne rien faire de plus
    if pending.statut == "REUSSIE":
        return {"status": "success", "message": "Paiement déjà confirmé."}

    statut = str(body.get("statut") or body.get("status") or body.get("state") or "").upper()
    if statut not in {"SUCCESS", "REUSSIE", "PAID", "PAIE"}:
        pending.statut = "ECHOUEE"
        pending.webhook_recu = True
        pending.date_webhook = datetime.now(timezone.utc)
        db.commit()
        return {"status": "failed", "message": "Paiement refusé par le provider."}

    # 3. Validation et enregistrement dans la base de données
    pending.statut = "REUSSIE"
    pending.webhook_recu = True
    pending.date_webhook = datetime.now(timezone.utc)
    ref_ext = body.get("transaction_id") or body.get("reference_externe")

    if pending.type == "PASSAGE_ADMIN":
        user = db.query(User).filter(User.id == pending.user_id).first()
        if user and user.role == Role.MEMBER:
            tx = Transaction(
                type=TransactionType.PASSAGE_ADMIN,
                statut=TransactionStatus.REUSSIE,
                provider=pending.provider,
                reference_externe=ref_ext,
                montant_brut=pending.montant_brut,
                montant_commission=0,
                montant_net=pending.montant_brut,
                user_id=pending.user_id,
            )
            db.add(tx)
            user.role = Role.ADMIN_TONTINE

            # Audit log
            audit = AuditLog(
                action="USER_PROMOTED_ADMIN_VIA_WEBHOOK",
                cible=user.id,
                details=f"Passage au rôle ADMIN_TONTINE via webhook {provider} (réf: {ref_interne})",
                acteur_id=user.id,
            )
            db.add(audit)

    elif pending.type == "COTISATION" and pending.tontine_id and pending.tontine_member_id:
        tontine = db.query(Tontine).filter(Tontine.id == pending.tontine_id).first()
        commission = calculer_commission(float(pending.montant_brut), float(tontine.taux_commission) if tontine else 0.03)
        net = float(pending.montant_brut) - commission

        tx = Transaction(
            type=TransactionType.COTISATION,
            statut=TransactionStatus.REUSSIE,
            provider=pending.provider,
            reference_externe=ref_ext,
            montant_brut=pending.montant_brut,
            montant_commission=commission,
            montant_net=net,
            user_id=pending.user_id,
            tontine_id=pending.tontine_id,
            tontine_member_id=pending.tontine_member_id,
            cycle_concerne=pending.cycle_concerne,
        )
        db.add(tx)

    db.commit()
    logger.info(f"Webhook {provider} traité avec succès pour la référence {ref_interne}.")
    return {"status": "success", "message": "Paiement validé avec succès."}
