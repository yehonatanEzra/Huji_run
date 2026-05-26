from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from .config import settings
from .database import engine, Base
from .models import User, TrainingGroup, GroupWorkout, IndividualTarget, WorkoutLog, Race, Heat, Result, RaceRegistration, HallOfFame, HealthProfessional, HealthReview, Kudos, Announcement, AnnouncementReaction, AnnouncementComment, Challenge
from .models.workout import WorkoutLogComment  # noqa: F401  (ensure table is registered with Base)
from .routers import auth, calendar, races, leaderboard, profile, coach, kudos
from .routers import health_wellness, feed, challenges, workout_comments, home

Base.metadata.create_all(bind=engine)


def _migrate_sqlite():
    """Legacy SQLite migrations. Skipped on other dialects (Postgres etc.)."""
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

        if "kudos" in tables:
            kudos_cols = {r[1] for r in conn.execute(text("PRAGMA table_info(kudos)"))}
            if "emoji" not in kudos_cols:
                conn.execute(text("ALTER TABLE kudos RENAME TO kudos_old"))
                conn.execute(text("""
                    CREATE TABLE kudos (
                        id INTEGER PRIMARY KEY AUTOINCREMENT,
                        giver_id INTEGER NOT NULL REFERENCES users(id),
                        workout_log_id INTEGER NOT NULL REFERENCES workout_logs(id) ON DELETE CASCADE,
                        emoji VARCHAR(20) NOT NULL DEFAULT 'clap',
                        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                        UNIQUE(giver_id, workout_log_id, emoji)
                    )
                """))
                conn.execute(text("INSERT INTO kudos (id, giver_id, workout_log_id, emoji, created_at) SELECT id, giver_id, workout_log_id, 'clap', created_at FROM kudos_old"))
                conn.execute(text("CREATE INDEX ix_kudos_workout_log_id ON kudos(workout_log_id)"))
                conn.execute(text("DROP TABLE kudos_old"))
                conn.commit()


if engine.dialect.name == "sqlite":
    _migrate_sqlite()


def _migrate_group_workout_columns():
    """Add structured-workout columns to group_workouts if missing. Works on SQLite + Postgres."""
    from sqlalchemy import inspect
    inspector = inspect(engine)
    if "group_workouts" not in inspector.get_table_names():
        return  # create_all will handle it
    existing = {c["name"] for c in inspector.get_columns("group_workouts")}
    to_add = []
    if "workout_type" not in existing:
        to_add.append(("workout_type", "VARCHAR(20) NOT NULL DEFAULT 'simple'"))
    if "title" not in existing:
        to_add.append(("title", "VARCHAR(200)"))
    if "warmup" not in existing:
        to_add.append(("warmup", "TEXT"))
    if "main_session" not in existing:
        to_add.append(("main_session", "TEXT"))
    if "cooldown" not in existing:
        to_add.append(("cooldown", "TEXT"))
    if not to_add:
        return
    with engine.connect() as conn:
        for col, ddl in to_add:
            conn.execute(text(f"ALTER TABLE group_workouts ADD COLUMN {col} {ddl}"))
        conn.commit()


_migrate_group_workout_columns()


def _migrate_race_is_manual():
    """Add the is_manual flag to races if missing. Works on SQLite + Postgres."""
    from sqlalchemy import inspect
    inspector = inspect(engine)
    if "races" not in inspector.get_table_names():
        return
    existing = {c["name"] for c in inspector.get_columns("races")}
    if "is_manual" in existing:
        return
    default_clause = "FALSE" if engine.dialect.name != "sqlite" else "0"
    with engine.connect() as conn:
        conn.execute(text(f"ALTER TABLE races ADD COLUMN is_manual BOOLEAN NOT NULL DEFAULT {default_clause}"))
        conn.commit()


_migrate_race_is_manual()


def _migrate_individual_target_columns():
    """Add structured-workout columns to individual_targets if missing. Works on SQLite + Postgres."""
    from sqlalchemy import inspect
    inspector = inspect(engine)
    if "individual_targets" not in inspector.get_table_names():
        return
    existing = {c["name"] for c in inspector.get_columns("individual_targets")}
    to_add = []
    if "workout_type" not in existing:
        to_add.append(("workout_type", "VARCHAR(20) NOT NULL DEFAULT 'simple'"))
    if "title" not in existing:
        to_add.append(("title", "VARCHAR(200)"))
    if "warmup" not in existing:
        to_add.append(("warmup", "TEXT"))
    if "main_session" not in existing:
        to_add.append(("main_session", "TEXT"))
    if "cooldown" not in existing:
        to_add.append(("cooldown", "TEXT"))
    if not to_add:
        return
    with engine.connect() as conn:
        for col, ddl in to_add:
            conn.execute(text(f"ALTER TABLE individual_targets ADD COLUMN {col} {ddl}"))
        conn.commit()


_migrate_individual_target_columns()


def _refresh_all_hall_of_fame():
    """Recompute the Hall of Fame for every canonical distance+gender on startup,
    so old results (added before the per-distance refresh was wired in, or
    inserted directly via SQL) always show up correctly."""
    from .database import SessionLocal
    from .models.race import CANONICAL_DISTANCES
    from .services.hall_of_fame import refresh_hall_of_fame
    db = SessionLocal()
    try:
        for d in CANONICAL_DISTANCES:
            for g in ("M", "F"):
                refresh_hall_of_fame(db, d, g)
        db.commit()
    finally:
        db.close()


try:
    _refresh_all_hall_of_fame()
except Exception as e:
    import logging
    logging.warning(f"Initial HoF refresh failed: {e}")


app = FastAPI(title="Huji Run API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
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
app.include_router(health_wellness.router, prefix=API_PREFIX)
app.include_router(feed.router, prefix=API_PREFIX)
app.include_router(challenges.router, prefix=API_PREFIX)
app.include_router(workout_comments.router, prefix=API_PREFIX)
app.include_router(home.router, prefix=API_PREFIX)


@app.get("/health")
def health():
    return {"status": "ok"}
