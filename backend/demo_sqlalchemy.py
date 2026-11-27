"""
demo_sqlalchemy.py
----------------------------------------------------------------------------
Démonstration de l'instanciation d'un modèle SQLAlchemy et de sa liaison
avec la base de données PostgreSQL.

Ce script montre concrètement :
1. La définition de la classe modèle SQLAlchemy (héritant de Declarative Base).
2. L'instanciation de l'objet Python : `nouvel_utilisateur = User(...)`.
3. L'attachement à la session SQLAlchemy : `db.add(nouvel_utilisateur)`.
4. La synchronisation et persistance dans PostgreSQL : `db.commit()`.
5. La récupération de l'ID généré et la relecture : `db.refresh(nouvel_utilisateur)`.
----------------------------------------------------------------------------
"""

import sys
import uuid
from datetime import datetime, timezone
from app.database import SessionLocal, init_db, engine
from app.models import User, Role, Subscription, PlanAbonnement, Tontine, TontineType, JourSemaine, TontineStatus
from app.security import hash_password

def run_demo():
    print("=" * 70)
    print("DÉMONSTRATION SQLALCHEMY + POSTGRESQL : INSTANCIATION ET PERSISTANCE")
    print("=" * 70)

    # Étape 1 : Initialisation des tables dans la base
    print("\n[1] Initialisation du schéma de base de données...")
    init_db()
    print(" -> Tables synchronisées via SQLAlchemy Metadata.")

    # Étape 2 : Création d'une session SQLAlchemy
    print("\n[2] Ouverture d'une session de base de données (SessionLocal)...")
    db = SessionLocal()

    try:
        # Étape 3 : Création d'une instance du modèle SQLAlchemy 'User'
        # C'est ici que le code Python instancie le modèle avant de le lier à Postgres
        test_email = f"demo_user_{uuid.uuid4().hex[:6]}@tontine.sn"
        print(f"\n[3] Instanciation du modèle SQLAlchemy 'User' en mémoire Python :")
        
        nouvel_utilisateur = User(
            id=uuid.uuid4().hex,
            email=test_email,
            telephone=f"+22177{uuid.uuid4().int % 10000000:07d}",
            password_hash=hash_password("Passer123!"),
            nom="Diop",
            prenom="Fatou",
            role=Role.MEMBER,
            is_verified=True,
            is_blocked=False,
        )

        print(f" -> Instance Python créée : {nouvel_utilisateur}")
        print(f"    - ID temporaire : {nouvel_utilisateur.id}")
        print(f"    - Nom complet   : {nouvel_utilisateur.prenom} {nouvel_utilisateur.nom}")
        print(f"    - Email         : {nouvel_utilisateur.email}")
        print(f"    - Rôle Enum     : {nouvel_utilisateur.role.value}")

        # Étape 4 : Ajout à la session de travail (Tracking Unit of Work)
        print("\n[4] Ajout de l'instance dans la session SQLAlchemy (db.add)...")
        db.add(nouvel_utilisateur)

        # Étape 5 : Exécution du COMMIT SQL (envoi de la requête INSERT vers PostgreSQL)
        print("\n[5] Envoi de l'instruction INSERT vers PostgreSQL (db.commit)...")
        db.commit()
        print(" -> Transaction validée dans PostgreSQL avec succès !")

        # Étape 6 : Rafraîchissement de l'instance pour récupérer les champs générés par la BDD
        print("\n[6] Rechargement de l'instance depuis PostgreSQL (db.refresh)...")
        db.refresh(nouvel_utilisateur)
        print(f" -> Données synchronisées avec Postgres :")
        print(f"    - CreatedAt en BDD : {nouvel_utilisateur.created_at}")
        print(f"    - UpdatedAt en BDD : {nouvel_utilisateur.updated_at}")

        # Étape 7 : Création d'un modèle lié avec clé étrangère (Subscription)
        print("\n[7] Instanciation d'un second modèle lié avec ForeignKey : 'Subscription'...")
        nouvel_abonnement = Subscription(
            user_id=nouvel_utilisateur.id,
            plan=PlanAbonnement.GRATUIT,
            prix_mensuel=0,
            actif=True,
        )
        db.add(nouvel_abonnement)
        db.commit()
        db.refresh(nouvel_abonnement)
        print(f" -> Abonnement créé en BDD avec ID: {nouvel_abonnement.id} lié à l'utilisateur {nouvel_abonnement.user_id}")

        # Étape 8 : Requête de vérification (SELECT)
        print("\n[8] Lecture de contrôle via SQLAlchemy Query...")
        utilisateur_en_base = db.query(User).filter(User.email == test_email).first()
        print(f" -> Trouvé en base : {utilisateur_en_base.email} (Rôle: {utilisateur_en_base.role.value})")

        print("\n" + "=" * 70)
        print("SUCCÈS : L'instance SQLAlchemy a été créée et liée à PostgreSQL !")
        print("=" * 70)

    except Exception as e:
        db.rollback()
        print(f"\n[ERREUR] Une erreur est survenue : {e}")
        raise
    finally:
        db.close()
        print("\n[9] Session fermée proprement.")

if __name__ == "__main__":
    run_demo()
