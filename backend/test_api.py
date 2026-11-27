"""
test_api.py
----------------------------------------------------------------------------
Tests d'intégration et de sécurité automatisés pour valider l'ensemble
du backend FastAPI avec SQLAlchemy, PostgreSQL et les correctifs de sécurité.
----------------------------------------------------------------------------
"""

import sys
import os
import json
import hmac
import hashlib
import time
import unittest
from fastapi.testclient import TestClient
from main import app
from app.database import SessionLocal, init_db
from app.models import User, Role, Tontine, TontineMember, Subscription, PendingPayment, TontineStatus, MemberStatus, PaymentProvider
from app.security import hash_password
from app.config import settings
from seed import seed

class TestFastAPIBackend(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        init_db()
        seed()
        cls.client = TestClient(app)
        cls.db = SessionLocal()

        # Garantir que les utilisateurs de test ont les bons mots de passe
        u_admin = cls.db.query(User).filter(User.email == "admin@tontine.sn").first()
        if u_admin:
            u_admin.password_hash = hash_password(settings.SUPER_ADMIN_PASSWORD or "SuperAdmin2026!")

        u_mariama = cls.db.query(User).filter(User.email == "aissatou@example.com").first()
        if u_mariama:
            u_mariama.password_hash = hash_password("Passer123!")

        cls.db.commit()

    @classmethod
    def tearDownClass(cls):
        cls.db.close()

    def test_01_root_and_health(self):
        """Vérifie que la racine et le endpoint de santé répondent correctement."""
        res_root = self.client.get("/")
        self.assertEqual(res_root.status_code, 200)
        self.assertEqual(res_root.json()["framework"], "FastAPI")

        res_health = self.client.get("/health")
        self.assertEqual(res_health.status_code, 200)
        self.assertEqual(res_health.json()["status"], "ok")

    def test_02_register_user_creates_model_instance(self):
        """Vérifie que l'inscription crée bien une instance User en base."""
        test_email = "test.inscription@tontine.sn"
        existant = self.db.query(User).filter(User.email == test_email).first()
        if existant:
            self.db.delete(existant)
            self.db.commit()

        payload = {
            "email": test_email,
            "telephone": "+221779998877",
            "password": "Password123!",
            "nom": "Sow",
            "prenom": "Oumar"
        }
        res = self.client.post("/api/auth/register", json=payload)
        self.assertEqual(res.status_code, 200)
        user_id = res.json()["userId"]
        self.assertTrue(user_id)

        # Vérification en base via SQLAlchemy
        user_en_base = self.db.query(User).filter(User.id == user_id).first()
        self.assertIsNotNone(user_en_base)
        self.assertEqual(user_en_base.email, test_email)
        self.assertFalse(user_en_base.is_verified)

    def test_03_verify_otp_and_login(self):
        """Vérifie l'activation du compte par OTP et la connexion."""
        test_email = "test.otp@tontine.sn"
        existant = self.db.query(User).filter(User.email == test_email).first()
        if existant:
            self.db.delete(existant)
            self.db.commit()

        # Inscription
        reg_res = self.client.post("/api/auth/register", json={
            "email": test_email,
            "telephone": "+221778887766",
            "password": "Password123!",
            "nom": "Kane",
            "prenom": "Aissatou"
        })
        self.assertEqual(reg_res.status_code, 200)
        user_id = reg_res.json()["userId"]

        # OTP (acceptation du code dev ou généré)
        otp_res = self.client.post("/api/auth/verify-otp", json={
            "userId": user_id,
            "code": "123456"
        })
        self.assertEqual(otp_res.status_code, 200)
        data = otp_res.json()
        self.assertIn("accessToken", data)
        self.assertTrue(data["user"]["isVerified"])

        # Login
        login_res = self.client.post("/api/auth/login", json={
            "email": test_email,
            "password": "Password123!"
        })
        self.assertEqual(login_res.status_code, 200)
        self.assertIn("accessToken", login_res.json())

    def test_04_authenticated_member_profile(self):
        """Vérifie l'accès au profil avec un token JWT."""
        login_res = self.client.post("/api/auth/login", json={
            "email": "aissatou@example.com",
            "password": "Passer123!"
        })
        self.assertEqual(login_res.status_code, 200)
        token = login_res.json()["accessToken"]

        headers = {"Authorization": f"Bearer {token}"}
        profil_res = self.client.get("/api/member/profil", headers=headers)
        self.assertEqual(profil_res.status_code, 200)
        self.assertEqual(profil_res.json()["email"], "aissatou@example.com")

    def test_05_list_tontines(self):
        """Vérifie la liste publique des tontines."""
        res = self.client.get("/api/tontines")
        self.assertEqual(res.status_code, 200)
        self.assertIsInstance(res.json(), list)

    def test_06_super_admin_dashboard(self):
        """Vérifie l'accès aux KPIs financiers du Super-Admin."""
        login_res = self.client.post("/api/auth/login", json={
            "email": "admin@tontine.sn",
            "password": settings.SUPER_ADMIN_PASSWORD or "SuperAdmin2026!"
        })
        self.assertEqual(login_res.status_code, 200)
        token = login_res.json()["accessToken"]

        headers = {"Authorization": f"Bearer {token}"}
        dash_res = self.client.get("/api/admin/dashboard", headers=headers)
        self.assertEqual(dash_res.status_code, 200)
        data = dash_res.json()
        self.assertIn("chiffreAffairesTotal", data)
        self.assertIn("totalUtilisateurs", data)

    def test_07_security_password_and_phone_policy(self):
        """Sécurité : Vérifie le rejet des mots de passe trop courts et numéros invalides."""
        # Mot de passe trop court (< 8 caractères)
        res_court = self.client.post("/api/auth/register", json={
            "email": "invalide@test.sn",
            "telephone": "+221771112233",
            "password": "court",
            "nom": "Test",
            "prenom": "User"
        })
        self.assertEqual(res_court.status_code, 422)

        # Numéro de téléphone sans indicatif international
        res_tel = self.client.post("/api/auth/register", json={
            "email": "invalide@test.sn",
            "telephone": "0612345678",
            "password": "Password123!",
            "nom": "Test",
            "prenom": "User"
        })
        self.assertEqual(res_tel.status_code, 422)

    def test_08_security_otp_rejection(self):
        """Sécurité : Vérifie le rejet d'un mauvais code OTP."""
        res_bad = self.client.post("/api/auth/verify-otp", json={
            "userId": "faux_user_id_inexistant",
            "code": "000000"
        })
        self.assertEqual(res_bad.status_code, 404)

    def test_09_security_webhook_hmac_protection(self):
        """Sécurité : Rejette les webhooks non signés ou falsifiés (Protection anti-spoofing)."""
        payload = {
            "referenceInterne": "REF_TEST_INEXISTANTE",
            "statut": "SUCCESS",
            "transaction_id": "WAVE_TX_123"
        }
        body_bytes = json.dumps(payload).encode("utf-8")

        # 1. Requête sans en-tête de signature -> 401 Unauthorized
        res_no_sig = self.client.post("/api/payments/webhook/wave", content=body_bytes)
        self.assertEqual(res_no_sig.status_code, 401)

        # 2. Requête avec signature invalide -> 401 Unauthorized
        res_bad_sig = self.client.post(
            "/api/payments/webhook/wave",
            content=body_bytes,
            headers={"x-signature": "mauvaise_signature_falsifiee"}
        )
        self.assertEqual(res_bad_sig.status_code, 401)

        # 3. Requête avec signature HMAC-SHA256 valide
        secret = settings.WAVE_WEBHOOK_SECRET
        valid_sig = hmac.new(secret.encode("utf-8"), body_bytes, hashlib.sha256).hexdigest()
        res_valid_sig = self.client.post(
            "/api/payments/webhook/wave",
            content=body_bytes,
            headers={"x-signature": valid_sig}
        )
        # La signature est acceptée (status != 401)
        self.assertNotEqual(res_valid_sig.status_code, 401)

    def test_10_security_idor_tontine_creator_authorization(self):
        """Sécurité : Vérifie qu'un admin ne peut pas manipuler la tontine d'un autre admin (Anti-IDOR)."""
        # Trouver la tontine créée par admin.tontine (Mariama)
        tontine = self.db.query(Tontine).first()
        self.assertIsNotNone(tontine)

        # Créer un deuxième admin de tontine malveillant
        autre_admin_email = "pirate.admin@exemple.sn"
        autre_admin = self.db.query(User).filter(User.email == autre_admin_email).first()
        if not autre_admin:
            autre_admin = User(
                email=autre_admin_email,
                telephone="+221770001122",
                password_hash=hash_password("Passer123!"),
                nom="Pirate",
                prenom="Admin",
                role=Role.ADMIN_TONTINE,
                is_verified=True,
            )
            self.db.add(autre_admin)
            self.db.commit()

        login_res = self.client.post("/api/auth/login", json={
            "email": autre_admin_email,
            "password": "Passer123!"
        })
        self.assertEqual(login_res.status_code, 200)
        pirate_token = login_res.json()["accessToken"]
        headers = {"Authorization": f"Bearer {pirate_token}"}

        # Tentative d'accès aux demandes de la tontine de l'autre créateur -> 403 Forbidden
        demandes_res = self.client.get(f"/api/tontines/{tontine.id}/demandes", headers=headers)
        self.assertEqual(demandes_res.status_code, 403)

        # Tentative d'exclusion d'un membre sur une tontine qui ne lui appartient pas -> 403 Forbidden
        exclure_res = self.client.post(
            f"/api/tontines/{tontine.id}/membres/{tontine.createur_id}/exclure",
            headers=headers
        )
        self.assertEqual(exclure_res.status_code, 403)

    def test_11_security_double_cotisation_prevention(self):
        """Sécurité : Vérifie l'interdiction de régler deux fois la même cotisation (Anti-Double Spending)."""
        tontine = self.db.query(Tontine).filter(Tontine.statut == TontineStatus.ACTIVE).first()
        if not tontine:
            return

        # Nettoyage des transactions de test pour ce cycle spécifique
        test_cycle = 999
        self.db.query(Transaction).filter(
            Transaction.cycle_concerne == test_cycle
        ).delete()
        self.db.commit()

        # Connecter le créateur qui est aussi le premier membre
        login_res = self.client.post("/api/auth/login", json={
            "email": "aissatou@example.com",
            "password": "Passer123!"
        })
        self.assertEqual(login_res.status_code, 200)
        token = login_res.json()["accessToken"]
        headers = {"Authorization": f"Bearer {token}"}

        payload = {"provider": "WAVE", "cycleConcerne": test_cycle}

        # Premier paiement -> doit réussir (200 OK)
        p1 = self.client.post(f"/api/member/tontines/{tontine.id}/payer", json=payload, headers=headers)
        self.assertEqual(p1.status_code, 200)

        # Deuxième paiement pour le même cycle 999 -> doit être bloqué (409 Conflict)
        p2 = self.client.post(f"/api/member/tontines/{tontine.id}/payer", json=payload, headers=headers)
        self.assertEqual(p2.status_code, 409)

if __name__ == "__main__":
    unittest.main()
