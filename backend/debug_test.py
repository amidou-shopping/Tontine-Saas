import time
from app.database import SessionLocal, init_db
from app.models import User, Role, Tontine
from app.security import hash_password, verify_password, create_access_token

print("[1] Test hashing password...")
t0 = time.time()
h = hash_password("Password123!")
print(f" -> Hash: {h[:20]}... in {time.time() - t0:.3f}s")
v = verify_password("Password123!", h)
print(f" -> Verify: {v}")

print("[2] Test token generation...")
token = create_access_token({"sub": "test_id", "email": "test@test.com", "role": "MEMBER"})
print(f" -> Token: {token[:25]}...")

print("[3] Test database query...")
db = SessionLocal()
u = db.query(User).first()
print(f" -> Premier utilisateur en base : {u.email if u else 'aucun'}")
db.close()

print("[4] Terminé sans problème !")
