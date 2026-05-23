from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from .database import engine, Base
from .models import User, TrainingGroup, GroupWorkout, IndividualTarget, WorkoutLog, Race, Heat, Result, HallOfFame, Kudos, Announcement, AnnouncementReaction, AnnouncementComment, Challenge
from .routers import auth, calendar, races, leaderboard, profile, coach, kudos, feed, challenges

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

        tables = {r[0] for r in conn.execute(text("SELECT name FROM sqlite_master WHERE type='table'"))}
        if "kudos" not in tables:
            conn.execute(text("""
                CREATE TABLE kudos (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    giver_id INTEGER NOT NULL REFERENCES users(id),
                    workout_log_id INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(giver_id, workout_log_id)
                )
            """))
            conn.execute(text("CREATE INDEX ix_kudos_workout_log_id ON kudos(workout_log_id)"))
            conn.commit()

        if "announcements" not in tables:
            conn.execute(text("""
                CREATE TABLE announcements (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    title VARCHAR(200) NOT NULL,
                    body TEXT NOT NULL,
                    author_id INTEGER NOT NULL REFERENCES users(id),
                    training_group_id INTEGER REFERENCES training_groups(id),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(text("""
                CREATE TABLE announcement_reactions (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    emoji VARCHAR(10) NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(announcement_id, user_id, emoji)
                )
            """))
            conn.execute(text("CREATE INDEX ix_ann_reactions_ann_id ON announcement_reactions(announcement_id)"))
            conn.commit()

        user_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(users)"))}
        if "photo_filename" not in user_cols:
            conn.execute(text("ALTER TABLE users ADD COLUMN photo_filename VARCHAR(255)"))
            conn.commit()

        if "announcement_comments" not in tables:
            conn.execute(text("""
                CREATE TABLE announcement_comments (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    announcement_id INTEGER NOT NULL REFERENCES announcements(id) ON DELETE CASCADE,
                    user_id INTEGER NOT NULL REFERENCES users(id),
                    body TEXT NOT NULL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(text("CREATE INDEX ix_ann_comments_ann_id ON announcement_comments(announcement_id)"))
            conn.commit()

        if "challenges" not in tables:
            conn.execute(text("""
                CREATE TABLE challenges (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    name VARCHAR(200) NOT NULL,
                    description TEXT,
                    challenge_type VARCHAR(20) NOT NULL,
                    target_distance_m INTEGER,
                    target_km REAL,
                    start_date DATE NOT NULL,
                    end_date DATE NOT NULL,
                    training_group_id INTEGER REFERENCES training_groups(id),
                    created_by INTEGER NOT NULL REFERENCES users(id),
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
                )
            """))
            conn.execute(text("CREATE INDEX ix_challenges_end_date ON challenges(end_date)"))
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
app.include_router(kudos.router, prefix=API_PREFIX)
app.include_router(feed.router, prefix=API_PREFIX)
app.include_router(challenges.router, prefix=API_PREFIX)


@app.get("/health")
def health():
    return {"status": "ok"}
