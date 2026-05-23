from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from .database import engine, Base
from .models import User, TrainingGroup, GroupWorkout, IndividualTarget, WorkoutLog, Race, Heat, Result, HallOfFame
from .routers import auth, calendar, races, leaderboard, profile, coach

Base.metadata.create_all(bind=engine)

def _migrate():
    with engine.connect() as conn:
        cols = {r[1] for r in conn.execute(text("PRAGMA table_info(workout_logs)"))}
        if "status" not in cols:
            conn.execute(text("ALTER TABLE workout_logs ADD COLUMN status VARCHAR(10) NOT NULL DEFAULT 'missed'"))
            conn.execute(text("UPDATE workout_logs SET status = CASE WHEN completed = 1 THEN 'completed' ELSE 'missed' END"))
            conn.commit()
        if "distance_km" not in cols:
            conn.execute(text("ALTER TABLE workout_logs ADD COLUMN distance_km REAL"))
            conn.commit()

_migrate()

app = FastAPI(title="Huji Run API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

API_PREFIX = "/api/v1"

app.include_router(auth.router, prefix=API_PREFIX)
app.include_router(calendar.router, prefix=API_PREFIX)
app.include_router(races.router, prefix=API_PREFIX)
app.include_router(leaderboard.router, prefix=API_PREFIX)
app.include_router(profile.router, prefix=API_PREFIX)
app.include_router(coach.router, prefix=API_PREFIX)


@app.get("/health")
def health():
    return {"status": "ok"}
