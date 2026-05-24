from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from .database import engine, Base
from .models import User, TrainingGroup, GroupWorkout, IndividualTarget, WorkoutLog, Race, Heat, Result, HallOfFame, HealthProfessional, HealthReview
from .routers import auth, calendar, races, leaderboard, profile, coach
from .routers import health_wellness

# Create all tables on startup (dev convenience; use Alembic for prod migrations)
Base.metadata.create_all(bind=engine)

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
app.include_router(health_wellness.router, prefix=API_PREFIX)


@app.get("/health")
def health():
    return {"status": "ok"}
