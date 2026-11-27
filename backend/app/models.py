import enum
import uuid
from datetime import datetime
from sqlalchemy import (
    Column,
    String,
    Boolean,
    Integer,
    Numeric,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.orm import relationship
from app.database import Base

def generate_uuid():
    return uuid.uuid4().hex

# ----------------------------------------------------------------------------
# ENUMS
# ----------------------------------------------------------------------------

class Role(str, enum.Enum):
    SUPER_ADMIN = "SUPER_ADMIN"
    ADMIN_TONTINE = "ADMIN_TONTINE"
    MEMBER = "MEMBER"

class TontineType(str, enum.Enum):
    CLASSIQUE = "CLASSIQUE"
    INVESTISSEMENT = "INVESTISSEMENT"

class TontineFrequency(str, enum.Enum):
    QUOTIDIENNE = "QUOTIDIENNE"
    HEBDOMADAIRE = "HEBDOMADAIRE"
    MENSUELLE = "MENSUELLE"

class JourSemaine(str, enum.Enum):
    LUNDI = "LUNDI"
    MARDI = "MARDI"
    MERCREDI = "MERCREDI"
    JEUDI = "JEUDI"
    VENDREDI = "VENDREDI"
    SAMEDI = "SAMEDI"
    DIMANCHE = "DIMANCHE"

class TontineStatus(str, enum.Enum):
    EN_ATTENTE = "EN_ATTENTE"
    ACTIVE = "ACTIVE"
    SUSPENDUE = "SUSPENDUE"
    TERMINEE = "TERMINEE"

class MemberStatus(str, enum.Enum):
    ACTIF = "ACTIF"
    EN_RETARD = "EN_RETARD"
    EXCLU = "EXCLU"
    SORTIE = "SORTIE"

class TransactionType(str, enum.Enum):
    COTISATION = "COTISATION"
    VERSEMENT_GAGNANT = "VERSEMENT_GAGNANT"
    COMMISSION = "COMMISSION"
    AMENDE_RETARD = "AMENDE_RETARD"
    ABONNEMENT = "ABONNEMENT"
    PASSAGE_ADMIN = "PASSAGE_ADMIN"
    REMBOURSEMENT = "REMBOURSEMENT"

class TransactionStatus(str, enum.Enum):
    EN_ATTENTE = "EN_ATTENTE"
    REUSSIE = "REUSSIE"
    ECHOUEE = "ECHOUEE"
    ANNULEE = "ANNULEE"

class PaymentProvider(str, enum.Enum):
    WAVE = "WAVE"
    ORANGE_MONEY = "ORANGE_MONEY"
    PAYTECH = "PAYTECH"
    PAYDUNYA = "PAYDUNYA"
    ESPECES = "ESPECES"
    VIREMENT = "VIREMENT"

class PlanAbonnement(str, enum.Enum):
    GRATUIT = "GRATUIT"
    STANDARD = "STANDARD"
    PREMIUM = "PREMIUM"

class StatutDemandeAdhesion(str, enum.Enum):
    EN_ATTENTE = "EN_ATTENTE"
    ACCEPTEE = "ACCEPTEE"
    REFUSEE = "REFUSEE"

# ----------------------------------------------------------------------------
# MODÈLES SQLALCHEMY CONNECTÉS À POSTGRESQL
# ----------------------------------------------------------------------------

class User(Base):
    __tablename__ = "users"

    id = Column("id", String(36), primary_key=True, default=generate_uuid)
    email = Column("email", String(255), unique=True, index=True, nullable=False)
    telephone = Column("telephone", String(50), unique=True, index=True, nullable=False)
    password_hash = Column("passwordHash", String(255), nullable=False)
    nom = Column("nom", String(100), nullable=False)
    prenom = Column("prenom", String(100), nullable=False)
    role = Column("role", SAEnum(Role, name="Role", native_enum=False), default=Role.MEMBER, index=True, nullable=False)
    est_principal = Column("estPrincipal", Boolean, default=False, nullable=False)
    is_blocked = Column("isBlocked", Boolean, default=False, nullable=False)
    is_verified = Column("isVerified", Boolean, default=False, nullable=False)
    avatar_url = Column("avatarUrl", String(255), nullable=True)
    created_at = Column("createdAt", DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False)
    updated_at = Column("updatedAt", DateTime(timezone=True), default=func.now(), server_default=func.now(), onupdate=func.now(), nullable=False)

    # Relations
    tontines_creees = relationship("Tontine", back_populates="createur", foreign_keys="Tontine.createur_id")
    participations = relationship("TontineMember", back_populates="user", foreign_keys="TontineMember.user_id")
    transactions = relationship("Transaction", back_populates="user", foreign_keys="Transaction.user_id")
    transactions_recues = relationship("Transaction", back_populates="beneficiaire", foreign_keys="Transaction.beneficiaire_user_id")
    abonnement = relationship("Subscription", back_populates="user", uselist=False, cascade="all, delete-orphan")
    notifications = relationship("Notification", back_populates="user", cascade="all, delete-orphan")
    demandes_adhesion = relationship("DemandeAdhesion", back_populates="user", foreign_keys="DemandeAdhesion.user_id")

class Subscription(Base):
    __tablename__ = "subscriptions"

    id = Column("id", String(36), primary_key=True, default=generate_uuid)
    user_id = Column("userId", String(36), ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    plan = Column("plan", SAEnum(PlanAbonnement, name="PlanAbonnement", native_enum=False), default=PlanAbonnement.GRATUIT, nullable=False)
    prix_mensuel = Column("prixMensuel", Numeric(12, 2), default=0, nullable=False)
    date_debut = Column("dateDebut", DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False)
    date_fin = Column("dateFin", DateTime(timezone=True), nullable=True)
    actif = Column("actif", Boolean, default=True, nullable=False)
    a_utilise_essai = Column("aUtiliseEssai", Boolean, default=False, nullable=False)
    en_essai = Column("enEssai", Boolean, default=False, nullable=False)

    user = relationship("User", back_populates="abonnement")

class ParametresPlateforme(Base):
    __tablename__ = "parametres_plateforme"

    id = Column("id", String(36), primary_key=True, default=generate_uuid)
    cle = Column("cle", String(50), unique=True, default="global", nullable=False)
    taux_commission = Column("tauxCommission", Numeric(5, 4), default=0.03, nullable=False)
    taux_amende = Column("tauxAmende", Numeric(5, 4), default=0.10, nullable=False)
    delai_grace_heures = Column("delaiGraceHeures", Integer, default=24, nullable=False)
    delai_avertissement_suppression_jours = Column("delaiAvertissementSuppressionJours", Integer, default=7, nullable=False)
    nombre_max_super_admins = Column("nombreMaxSuperAdmins", Integer, default=3, nullable=False)
    prix_standard_fcfa = Column("prixStandardFcfa", Integer, default=5000, nullable=False)
    prix_premium_fcfa = Column("prixPremiumFcfa", Integer, default=15000, nullable=False)
    frais_passage_admin_fcfa = Column("fraisPassageAdminFcfa", Integer, default=1000, nullable=False)
    limite_tontines_gratuites = Column("limiteTontinesGratuites", Integer, default=1, nullable=False)
    limite_tontines_standard = Column("limiteTontinesStandard", Integer, default=5, nullable=False)
    duree_essai_jours = Column("dureeEssaiJours", Integer, default=14, nullable=False)
    duree_abonnement_jours = Column("dureeAbonnementJours", Integer, default=30, nullable=False)
    updated_at = Column("updatedAt", DateTime(timezone=True), default=func.now(), server_default=func.now(), onupdate=func.now(), nullable=False)

class Tontine(Base):
    __tablename__ = "tontines"

    id = Column("id", String(36), primary_key=True, default=generate_uuid)
    nom = Column("nom", String(100), nullable=False)
    description = Column("description", Text, nullable=True)
    type = Column("type", SAEnum(TontineType, name="TontineType", native_enum=False), default=TontineType.CLASSIQUE, nullable=False)
    montant_cotisation = Column("montantCotisation", Numeric(12, 2), nullable=False)
    frequence = Column("frequence", SAEnum(TontineFrequency, name="TontineFrequency", native_enum=False), default=TontineFrequency.MENSUELLE, nullable=False)
    jour_cotisation = Column("jourCotisation", SAEnum(JourSemaine, name="JourSemaine", native_enum=False), default=JourSemaine.LUNDI, nullable=False)
    taux_commission = Column("tauxCommission", Numeric(5, 4), default=0.03, nullable=False)
    nombre_max_membres = Column("nombreMaxMembres", Integer, nullable=False)
    statut = Column("statut", SAEnum(TontineStatus, name="TontineStatus", native_enum=False), default=TontineStatus.EN_ATTENTE, index=True, nullable=False)
    date_debut = Column("dateDebut", DateTime(timezone=True), nullable=True)
    cycle_actuel = Column("cycleActuel", Integer, default=1, nullable=False)
    code_invitation = Column("codeInvitation", String(50), unique=True, index=True, nullable=False)
    suppression_demandee_at = Column("suppressionDemandeeAt", DateTime(timezone=True), nullable=True)

    createur_id = Column("createurId", String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column("createdAt", DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False)
    updated_at = Column("updatedAt", DateTime(timezone=True), default=func.now(), server_default=func.now(), onupdate=func.now(), nullable=False)

    createur = relationship("User", back_populates="tontines_creees", foreign_keys=[createur_id])
    membres = relationship("TontineMember", back_populates="tontine", cascade="all, delete-orphan")
    demandes_adhesion = relationship("DemandeAdhesion", back_populates="tontine", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="tontine")

class TontineMember(Base):
    __tablename__ = "tontine_members"

    id = Column("id", String(36), primary_key=True, default=generate_uuid)
    tontine_id = Column("tontineId", String(36), ForeignKey("tontines.id", ondelete="CASCADE"), nullable=False)
    user_id = Column("userId", String(36), ForeignKey("users.id"), nullable=False)
    ordre_passage = Column("ordrePassage", Integer, nullable=False)
    statut = Column("statut", SAEnum(MemberStatus, name="MemberStatus", native_enum=False), default=MemberStatus.ACTIF, nullable=False)
    a_deja_recu = Column("aDejaRecu", Boolean, default=False, nullable=False)
    date_reception = Column("dateReception", DateTime(timezone=True), nullable=True)
    joined_at = Column("joinedAt", DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False)

    tontine = relationship("Tontine", back_populates="membres")
    user = relationship("User", back_populates="participations")
    transactions = relationship("Transaction", back_populates="tontine_member")

    __table_args__ = (
        UniqueConstraint("tontineId", "userId", name="uq_tontine_user"),
        UniqueConstraint("tontineId", "ordrePassage", name="uq_tontine_ordre"),
    )

class DemandeAdhesion(Base):
    __tablename__ = "demandes_adhesion"

    id = Column("id", String(36), primary_key=True, default=generate_uuid)
    tontine_id = Column("tontineId", String(36), ForeignKey("tontines.id", ondelete="CASCADE"), nullable=False)
    user_id = Column("userId", String(36), ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    statut = Column("statut", SAEnum(StatutDemandeAdhesion, name="StatutDemandeAdhesion", native_enum=False), default=StatutDemandeAdhesion.EN_ATTENTE, nullable=False)
    motif_refus = Column("motifRefus", Text, nullable=True)
    traitee_par_id = Column("traiteeParId", String(36), ForeignKey("users.id"), nullable=True)
    created_at = Column("createdAt", DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False)
    traitee_at = Column("traiteeAt", DateTime(timezone=True), nullable=True)

    tontine = relationship("Tontine", back_populates="demandes_adhesion")
    user = relationship("User", back_populates="demandes_adhesion", foreign_keys=[user_id])

class Transaction(Base):
    __tablename__ = "transactions"

    id = Column("id", String(36), primary_key=True, default=generate_uuid)
    type = Column("type", SAEnum(TransactionType, name="TransactionType", native_enum=False), nullable=False)
    statut = Column("statut", SAEnum(TransactionStatus, name="TransactionStatus", native_enum=False), default=TransactionStatus.EN_ATTENTE, index=True, nullable=False)
    provider = Column("provider", SAEnum(PaymentProvider, name="PaymentProvider", native_enum=False), nullable=True)
    reference_externe = Column("referenceExterne", String(255), nullable=True)

    montant_brut = Column("montantBrut", Numeric(12, 2), nullable=False)
    montant_commission = Column("montantCommission", Numeric(12, 2), default=0, nullable=False)
    montant_net = Column("montantNet", Numeric(12, 2), nullable=False)

    user_id = Column("userId", String(36), ForeignKey("users.id"), nullable=False)
    beneficiaire_user_id = Column("beneficiaireUserId", String(36), ForeignKey("users.id"), nullable=True)
    tontine_id = Column("tontineId", String(36), ForeignKey("tontines.id"), nullable=True)
    tontine_member_id = Column("tontineMemberId", String(36), ForeignKey("tontine_members.id"), nullable=True)
    cycle_concerne = Column("cycleConcerne", Integer, nullable=True)

    created_at = Column("createdAt", DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False)
    updated_at = Column("updatedAt", DateTime(timezone=True), default=func.now(), server_default=func.now(), onupdate=func.now(), nullable=False)

    user = relationship("User", back_populates="transactions", foreign_keys=[user_id])
    beneficiaire = relationship("User", back_populates="transactions_recues", foreign_keys=[beneficiaire_user_id])
    tontine = relationship("Tontine", back_populates="transactions")
    tontine_member = relationship("TontineMember", back_populates="transactions")

class AmendeRetard(Base):
    __tablename__ = "amendes_retard"

    id = Column("id", String(36), primary_key=True, default=generate_uuid)
    tontine_id = Column("tontineId", String(36), ForeignKey("tontines.id"), nullable=False)
    tontine_member_id = Column("tontineMemberId", String(36), ForeignKey("tontine_members.id"), nullable=False)
    cycle_concerne = Column("cycleConcerne", Integer, nullable=False)
    montant = Column("montant", Numeric(12, 2), nullable=False)
    beneficiaire_user_id = Column("beneficiaireUserId", String(36), ForeignKey("users.id"), nullable=False)
    transaction_id = Column("transactionId", String(36), ForeignKey("transactions.id"), unique=True, nullable=True)
    created_at = Column("createdAt", DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False)

    __table_args__ = (
        UniqueConstraint("tontineMemberId", "cycleConcerne", name="uq_amende_member_cycle"),
    )

class Notification(Base):
    __tablename__ = "notifications"

    id = Column("id", String(36), primary_key=True, default=generate_uuid)
    user_id = Column("userId", String(36), ForeignKey("users.id"), nullable=False)
    titre = Column("titre", String(255), nullable=False)
    message = Column("message", Text, nullable=False)
    type = Column("type", String(50), default="INFO", nullable=False)
    lien = Column("lien", String(255), nullable=True)
    lue = Column("lue", Boolean, default=False, nullable=False)
    created_at = Column("createdAt", DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False)

    user = relationship("User", back_populates="notifications")

class PendingPayment(Base):
    __tablename__ = "pending_payments"

    id = Column("id", String(36), primary_key=True, default=generate_uuid)
    type = Column("type", String(50), default="COTISATION", nullable=False)
    tontine_id = Column("tontineId", String(36), ForeignKey("tontines.id"), nullable=True)
    user_id = Column("userId", String(36), ForeignKey("users.id"), nullable=False)
    tontine_member_id = Column("tontineMemberId", String(36), ForeignKey("tontine_members.id"), nullable=True)
    provider = Column("provider", SAEnum(PaymentProvider, name="PaymentProvider", native_enum=False), nullable=False)
    reference_interne = Column("referenceInterne", String(255), unique=True, index=True, nullable=False)
    reference_externe = Column("referenceExterne", String(255), nullable=True)
    montant_brut = Column("montantBrut", Numeric(12, 2), nullable=False)
    cycle_concerne = Column("cycleConcerne", Integer, nullable=True)
    statut = Column("statut", String(50), default="EN_ATTENTE", index=True, nullable=False)
    webhook_recu = Column("webhookRecu", Boolean, default=False, nullable=False)
    date_webhook = Column("dateWebhook", DateTime(timezone=True), nullable=True)
    created_at = Column("createdAt", DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False)
    updated_at = Column("updatedAt", DateTime(timezone=True), default=func.now(), server_default=func.now(), onupdate=func.now(), nullable=False)

class AuditLog(Base):
    __tablename__ = "audit_logs"

    id = Column("id", String(36), primary_key=True, default=generate_uuid)
    action = Column("action", String(100), nullable=False)
    cible = Column("cible", String(255), nullable=False)
    details = Column("details", Text, nullable=True)
    acteur_id = Column("acteurId", String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column("createdAt", DateTime(timezone=True), default=func.now(), server_default=func.now(), nullable=False)
