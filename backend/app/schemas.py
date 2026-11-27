from typing import Optional, List, Any
from datetime import datetime
import re
from pydantic import BaseModel, Field, ConfigDict, AliasChoices, field_validator
from app.models import (
    Role,
    TontineType,
    TontineFrequency,
    JourSemaine,
    TontineStatus,
    MemberStatus,
    TransactionType,
    TransactionStatus,
    PaymentProvider,
    PlanAbonnement,
    StatutDemandeAdhesion,
)

# ----------------------------------------------------------------------------
# AUTH SCHEMAS
# ----------------------------------------------------------------------------

class RegisterDto(BaseModel):
    email: str
    telephone: str
    password: str
    nom: str
    prenom: str

    @field_validator("email")
    @classmethod
    def valider_email(cls, v: str) -> str:
        v = v.strip().lower()
        if not re.match(r"^[\w\.-]+@[\w\.-]+\.\w{2,}$", v):
            raise ValueError("Format d'adresse email invalide.")
        return v

    @field_validator("telephone")
    @classmethod
    def valider_telephone(cls, v: str) -> str:
        v = v.strip()
        if not re.match(r"^\+221\d{9}$", v):
            raise ValueError("Numéro sénégalais requis au format international (+221XXXXXXXXX).")
        return v

    @field_validator("password")
    @classmethod
    def valider_password(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Le mot de passe doit comporter au moins 8 caractères.")
        if not re.search(r"[A-Za-z]", v) or not re.search(r"\d", v):
            raise ValueError("Le mot de passe doit contenir au moins une lettre et un chiffre.")
        return v

class LoginDto(BaseModel):
    email: str
    password: str

class VerifyOtpDto(BaseModel):
    userId: str
    code: str

class ResendOtpDto(BaseModel):
    userId: str

class UserResponse(BaseModel):
    id: str
    email: str
    telephone: str
    nom: str
    prenom: str
    role: Role
    estPrincipal: bool = Field(default=False, validation_alias=AliasChoices("is_principal", "est_principal", "estPrincipal"))
    isBlocked: bool = Field(default=False, validation_alias=AliasChoices("is_blocked", "isBlocked"))
    isVerified: bool = Field(default=False, validation_alias=AliasChoices("is_verified", "isVerified"))
    avatarUrl: Optional[str] = Field(default=None, validation_alias=AliasChoices("avatar_url", "avatarUrl"))
    createdAt: Optional[datetime] = Field(default=None, validation_alias=AliasChoices("created_at", "createdAt"))

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

class AuthResponse(BaseModel):
    accessToken: str
    user: UserResponse

class RegisterResponse(BaseModel):
    userId: str
    message: str

# ----------------------------------------------------------------------------
# TONTINE SCHEMAS
# ----------------------------------------------------------------------------

class CreateTontineDto(BaseModel):
    nom: str
    description: Optional[str] = None
    type: Optional[TontineType] = TontineType.CLASSIQUE
    montantCotisation: float
    jourCotisation: JourSemaine
    nombreMaxMembres: int

class RejoindreParCodeDto(BaseModel):
    codeInvitation: str

class RepondreDemandeDto(BaseModel):
    motifRefus: Optional[str] = None

class TontineMemberResponse(BaseModel):
    id: str
    tontineId: str = Field(validation_alias=AliasChoices("tontine_id", "tontineId"))
    userId: str = Field(validation_alias=AliasChoices("user_id", "userId"))
    ordrePassage: int = Field(validation_alias=AliasChoices("ordre_passage", "ordrePassage"))
    statut: MemberStatus
    aDejaRecu: bool = Field(default=False, validation_alias=AliasChoices("a_deja_recu", "aDejaRecu"))
    joinedAt: datetime = Field(validation_alias=AliasChoices("joined_at", "joinedAt"))
    user: Optional[UserResponse] = None

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

class TontineResponse(BaseModel):
    id: str
    nom: str
    description: Optional[str] = None
    type: TontineType
    montantCotisation: float = Field(validation_alias=AliasChoices("montant_cotisation", "montantCotisation"))
    frequence: TontineFrequency
    jourCotisation: JourSemaine = Field(validation_alias=AliasChoices("jour_cotisation", "jourCotisation"))
    tauxCommission: float = Field(validation_alias=AliasChoices("taux_commission", "tauxCommission"))
    nombreMaxMembres: int = Field(validation_alias=AliasChoices("nombre_max_membres", "nombreMaxMembres"))
    statut: TontineStatus
    dateDebut: Optional[datetime] = Field(default=None, validation_alias=AliasChoices("date_debut", "dateDebut"))
    cycleActuel: int = Field(validation_alias=AliasChoices("cycle_actuel", "cycleActuel"))
    codeInvitation: str = Field(validation_alias=AliasChoices("code_invitation", "codeInvitation"))
    createurId: str = Field(validation_alias=AliasChoices("createur_id", "createurId"))
    createdAt: datetime = Field(validation_alias=AliasChoices("created_at", "createdAt"))
    membres: Optional[List[TontineMemberResponse]] = []

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

# ----------------------------------------------------------------------------
# MEMBER & PROFILE SCHEMAS
# ----------------------------------------------------------------------------

class UpdateProfilDto(BaseModel):
    nom: Optional[str] = None
    prenom: Optional[str] = None
    telephone: Optional[str] = None

class PayerCotisationDto(BaseModel):
    provider: PaymentProvider
    cycleConcerne: Optional[int] = None

class InitierPassageAdminDto(BaseModel):
    provider: PaymentProvider
    telephone: Optional[str] = None

class ConfirmerPassageAdminDto(BaseModel):
    referenceInterne: str

# ----------------------------------------------------------------------------
# SUBSCRIPTION SCHEMAS
# ----------------------------------------------------------------------------

class ChangerPlanDto(BaseModel):
    plan: PlanAbonnement

class SubscriptionResponse(BaseModel):
    id: str
    userId: str = Field(validation_alias=AliasChoices("user_id", "userId"))
    plan: PlanAbonnement
    prixMensuel: float = Field(validation_alias=AliasChoices("prix_mensuel", "prixMensuel"))
    dateDebut: datetime = Field(validation_alias=AliasChoices("date_debut", "dateDebut"))
    dateFin: Optional[datetime] = Field(default=None, validation_alias=AliasChoices("date_fin", "dateFin"))
    actif: bool
    aUtiliseEssai: bool = Field(default=False, validation_alias=AliasChoices("a_utilise_essai", "aUtiliseEssai"))
    enEssai: bool = Field(default=False, validation_alias=AliasChoices("en_essai", "enEssai"))

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

# ----------------------------------------------------------------------------
# TRANSACTION SCHEMAS
# ----------------------------------------------------------------------------

class TransactionResponse(BaseModel):
    id: str
    type: TransactionType
    statut: TransactionStatus
    provider: Optional[PaymentProvider] = None
    montantBrut: float = Field(validation_alias=AliasChoices("montant_brut", "montantBrut"))
    montantCommission: float = Field(default=0, validation_alias=AliasChoices("montant_commission", "montantCommission"))
    montantNet: float = Field(validation_alias=AliasChoices("montant_net", "montantNet"))
    userId: str = Field(validation_alias=AliasChoices("user_id", "userId"))
    tontineId: Optional[str] = Field(default=None, validation_alias=AliasChoices("tontine_id", "tontineId"))
    cycleConcerne: Optional[int] = Field(default=None, validation_alias=AliasChoices("cycle_concerne", "cycleConcerne"))
    createdAt: datetime = Field(validation_alias=AliasChoices("created_at", "createdAt"))

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)

# ----------------------------------------------------------------------------
# NOTIFICATION SCHEMAS
# ----------------------------------------------------------------------------

class NotificationResponse(BaseModel):
    id: str
    titre: str
    message: str
    type: str
    lien: Optional[str] = None
    lue: bool
    createdAt: datetime = Field(validation_alias=AliasChoices("created_at", "createdAt"))

    model_config = ConfigDict(from_attributes=True, populate_by_name=True)
