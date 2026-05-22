"""
Run once to seed the coach account.
Usage: python seed.py
"""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from passlib.context import CryptContext
from app.database import SessionLocal, engine, Base
from app.models import User, Race, Heat, Result, HallOfFame
from app.services.hall_of_fame import refresh_hall_of_fame

Base.metadata.create_all(bind=engine)
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

COACH_USERNAME = "yonzra12@gmail.com"
COACH_PASSWORD = "huji_run_manager"

db = SessionLocal()

try:
    existing = db.query(User).filter(User.username == COACH_USERNAME).first()
    if not existing:
        coach = User(
            full_name="Coach",
            username=COACH_USERNAME,
            password_hash=pwd_context.hash(COACH_PASSWORD),
            gender="M",
            role="coach",
        )
        db.add(coach)
        db.commit()
        print(f"✓ Coach account created: {COACH_USERNAME}")
    else:
        print(f"✓ Coach account already exists: {COACH_USERNAME}")
finally:
    db.close()

print("Seed complete.")
