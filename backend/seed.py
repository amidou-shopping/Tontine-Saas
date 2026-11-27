"""
seed.py
----------------------------------------------------------------------------
Script d'initialisation (Seed) pour peupler la base de données PostgreSQL
avec les utilisateurs initiaux, les rôles, les paramètres de plateforme et
une tontine de démonstration.
----------------------------------------------------------------------------
"""

import uuid
from datetime import datetime, timezone
from app.database import SessionLocal, init_db
from app.models import (
    User,
    Subscription,
    ParametresPlateforme,
    Tontine,
    TontineMember,
    Role,
    PlanAbonnement,
    TontineType,
    TontineFrequency,
    JourSemaine,
    TontineStatus,
    MemberStatus,
)
from app.security import hash_password
from app.config import settings

def seed():
    password_admin = settings.SUPER_ADMIN_PASSWORD or "SuperAdmin2026!"
    print("Initialisation du schéma de la base de données...")
    init_db()

    db = SessionLocal()
    try:
        # 1. Paramètres de la plateforme
        params = db.query(ParametresPlateforme).filter(ParametresPlateforme.cle == "global").first()
        if not params:
            print("Création de l'instance ParametresPlateforme...")
            params = ParametresPlateforme(
                cle="global",
                taux_commission=0.03,
                taux_amende=0.10,
                delai_grace_heures=24,
                delai_avertissement_suppression_jours=7,
                nombre_max_super_admins=3,
                prix_standard_fcfa=5000,
                prix_premium_fcfa=15000,
                frais_passage_admin_fcfa=1000,
                limite_tontines_gratuites=1,
                limite_tontines_standard=5,
                duree_essai_jours=14,
                duree_abonnement_jours=30,
            )
            db.add(params)
            db.commit()

        # 2. Super-Admin Principal
        super_admin_email = settings.SUPER_ADMIN_PRINCIPAL_EMAIL
        super_admin = db.query(User).filter(
            (User.email == super_admin_email) | (User.est_principal == True)
        ).first()
        if not super_admin:
            print(f"Création de l'instance Super-Admin ({super_admin_email})...")
            super_admin = User(
                email=super_admin_email,
                telephone="+221770000099",
                password_hash=hash_password(password_admin),
                nom="Diallo",
                prenom="Ibrahima",
                role=Role.SUPER_ADMIN,
                est_principal=True,
                is_blocked=False,
                is_verified=True,
            )
            db.add(super_admin)
            db.commit()
            db.refresh(super_admin)

            sub_admin = Subscription(
                user_id=super_admin.id,
                plan=PlanAbonnement.PREMIUM,
                prix_mensuel=0,
                actif=True,
            )
            db.add(sub_admin)
            db.commit()
            print(" -> Super-Admin principal créé avec succès.")

        # 3. Administrateur de Tontine Démo
        admin_tontine_email = "admin.tontine@exemple.sn"
        admin_tontine = db.query(User).filter(User.email == admin_tontine_email).first()
        if not admin_tontine:
            print(f"Création de l'administrateur de tontine démo ({admin_tontine_email})...")
            admin_tontine = User(
                email=admin_tontine_email,
                telephone="+221771112233",
                password_hash=hash_password("Passer123!"),
                nom="Sow",
                prenom="Mariama",
                role=Role.ADMIN_TONTINE,
                is_verified=True,
            )
            db.add(admin_tontine)
            db.commit()
            db.refresh(admin_tontine)

            sub_tontine = Subscription(
                user_id=admin_tontine.id,
                plan=PlanAbonnement.STANDARD,
                prix_mensuel=5000,
                actif=True,
            )
            db.add(sub_tontine)
            db.commit()

        # 4. Membres Démo
        membres_data = [
            ("fall.awa@exemple.sn", "+221772223344", "Fall", "Awa"),
            ("ba.moussa@exemple.sn", "+221773334455", "Ba", "Moussa"),
            ("ndiaye.cheikh@exemple.sn", "+221774445566", "Ndiaye", "Cheikh"),
        ]

        membres_users = []
        for email, tel, nom, prenom in membres_data:
            u = db.query(User).filter(User.email == email).first()
            if not u:
                u = User(
                    email=email,
                    telephone=tel,
                    password_hash=hash_password("Passer123!"),
                    nom=nom,
                    prenom=prenom,
                    role=Role.MEMBER,
                    is_verified=True,
                )
                db.add(u)
                db.commit()
                db.refresh(u)

                sub_m = Subscription(user_id=u.id, plan=PlanAbonnement.GRATUIT, prix_mensuel=0, actif=True)
                db.add(sub_m)
                db.commit()
            membres_users.append(u)

        # 5. Tontine de Démonstration
        tontine_code = "TNT-2026"
        demo_tontine = db.query(Tontine).filter(Tontine.code_invitation == tontine_code).first()
        if not demo_tontine and admin_tontine:
            print("Création de l'instance Tontine 'Tontine Solidarité Dakar'...")
            demo_tontine = Tontine(
                nom="Tontine Solidarité Dakar",
                description="Tontine d'entraide pour projets d'épargne et d'investissement.",
                type=TontineType.CLASSIQUE,
                montant_cotisation=10000,
                frequence=TontineFrequency.HEBDOMADAIRE,
                jour_cotisation=JourSemaine.LUNDI,
                taux_commission=0.03,
                nombre_max_membres=5,
                statut=TontineStatus.ACTIVE,
                cycle_actuel=1,
                code_invitation=tontine_code,
                createur_id=admin_tontine.id,
                date_debut=datetime.now(timezone.utc),
            )
            db.add(demo_tontine)
            db.commit()
            db.refresh(demo_tontine)

            # Membres de la tontine
            tous_les_participants = [admin_tontine] + membres_users
            for index, participant in enumerate(tous_les_participants, start=1):
                tm = TontineMember(
                    tontine_id=demo_tontine.id,
                    user_id=participant.id,
                    ordre_passage=index,
                    statut=MemberStatus.ACTIF,
                )
                db.add(tm)
            db.commit()
            print(" -> Tontine démo et ses membres insérés avec succès.")

        print("\nSeed terminé avec succès !")
        print("--------------------------------------------------")
        print(f"Super-Admin    : {settings.SUPER_ADMIN_PRINCIPAL_EMAIL} / {settings.SUPER_ADMIN_PASSWORD}")
        print("Admin Tontine  : admin.tontine@exemple.sn / Passer123!")
        print("Membre 1       : fall.awa@exemple.sn / Passer123!")
        print("Code Tontine   : TNT-2026")
        print("--------------------------------------------------")

    finally:
        db.close()

if __name__ == "__main__":
    seed()
