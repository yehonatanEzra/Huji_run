from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import text
from .config import settings
from .database import engine, Base
from .models import User, TrainingGroup, GroupWorkout, IndividualTarget, WorkoutLog, Race, Heat, Result, RaceRegistration, HallOfFame, HealthProfessional, HealthReview, Kudos, Announcement, AnnouncementReaction, AnnouncementComment, Challenge
from .models.workout import WorkoutLogComment  # noqa: F401  (ensure table is registered with Base)
from .models.notification import Notification  # noqa: F401
from .routers import auth, calendar, races, leaderboard, profile, coach, kudos
from .routers import health_wellness, feed, challenges, workout_comments, home, coaching, admin_review, strava, notifications

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


def _migrate_drop_group_workout_unique():
    """Drop the legacy UNIQUE(training_group_id, date) constraint on
    group_workouts so multiple workouts may exist per (group, date)."""
    from sqlalchemy import inspect
    inspector = inspect(engine)
    if "group_workouts" not in inspector.get_table_names():
        return
    if engine.dialect.name == "sqlite":
        # SQLite enforces table-level UNIQUE via auto-named indexes that can't
        # be DROP-INDEXed. The only way to remove the constraint is to rebuild
        # the table.
        with engine.connect() as conn:
            rows = list(conn.execute(text("PRAGMA index_list('group_workouts')")))
            needs_rebuild = False
            for r in rows:
                idx_name, is_unique = r[1], r[2]
                if not is_unique:
                    continue
                cols = [c[2] for c in conn.execute(text(f"PRAGMA index_info('{idx_name}')"))]
                if set(cols) == {"training_group_id", "date"}:
                    needs_rebuild = True
                    break
            if not needs_rebuild:
                return
            conn.execute(text("PRAGMA foreign_keys=OFF"))
            try:
                conn.execute(text("""
                    CREATE TABLE group_workouts_new (
                        id INTEGER PRIMARY KEY,
                        training_group_id INTEGER NOT NULL REFERENCES training_groups(id),
                        date DATE NOT NULL,
                        workout_type VARCHAR(20) NOT NULL DEFAULT 'simple',
                        title VARCHAR(200),
                        content TEXT,
                        warmup TEXT,
                        main_session TEXT,
                        cooldown TEXT,
                        draft_content TEXT,
                        created_by INTEGER NOT NULL REFERENCES users(id),
                        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
                    )
                """))
                conn.execute(text("""
                    INSERT INTO group_workouts_new
                        (id, training_group_id, date, workout_type, title, content,
                         warmup, main_session, cooldown, draft_content, created_by, updated_at)
                    SELECT id, training_group_id, date, workout_type, title, content,
                           warmup, main_session, cooldown, draft_content, created_by, updated_at
                    FROM group_workouts
                """))
                conn.execute(text("DROP TABLE group_workouts"))
                conn.execute(text("ALTER TABLE group_workouts_new RENAME TO group_workouts"))
                conn.execute(text("CREATE INDEX ix_group_workouts_training_group_id ON group_workouts(training_group_id)"))
                conn.execute(text("CREATE INDEX ix_group_workouts_date ON group_workouts(date)"))
                conn.commit()
            finally:
                conn.execute(text("PRAGMA foreign_keys=ON"))
    else:
        with engine.connect() as conn:
            try:
                conn.execute(text(
                    "ALTER TABLE group_workouts DROP CONSTRAINT IF EXISTS uq_group_workout_group_date"
                ))
                conn.commit()
            except Exception:
                pass


_migrate_drop_group_workout_unique()


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


def _migrate_users_coach_id():
    """Add User.coach_id column if missing (athlete → their coach)."""
    from sqlalchemy import inspect
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    existing = {c["name"] for c in inspector.get_columns("users")}
    if "coach_id" in existing:
        return
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN coach_id INTEGER REFERENCES users(id)"))
        try:
            conn.execute(text("CREATE INDEX ix_users_coach_id ON users(coach_id)"))
        except Exception:
            pass
        conn.commit()


_migrate_users_coach_id()


def _migrate_training_groups_coach_id():
    """Add TrainingGroup.coach_id column if missing (group → owning coach)."""
    from sqlalchemy import inspect
    inspector = inspect(engine)
    if "training_groups" not in inspector.get_table_names():
        return
    existing = {c["name"] for c in inspector.get_columns("training_groups")}
    if "coach_id" in existing:
        return
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE training_groups ADD COLUMN coach_id INTEGER REFERENCES users(id)"))
        try:
            conn.execute(text("CREATE INDEX ix_training_groups_coach_id ON training_groups(coach_id)"))
        except Exception:
            pass
        conn.commit()


_migrate_training_groups_coach_id()


def _migrate_role_enum_add_admin():
    """Add 'admin' to the role enum on Postgres. SQLite stores the role as a
    plain string at runtime so no DDL change is needed there."""
    if engine.dialect.name == "sqlite":
        return
    with engine.connect() as conn:
        try:
            # ADD VALUE IF NOT EXISTS is the idempotent form (Postgres >= 9.6).
            conn.execute(text("ALTER TYPE role_enum ADD VALUE IF NOT EXISTS 'admin'"))
            conn.commit()
        except Exception:
            try:
                conn.execute(text("ALTER TYPE role_enum ADD VALUE 'admin'"))
                conn.commit()
            except Exception:
                pass  # already there


_migrate_role_enum_add_admin()


def _migrate_race_moderation_columns():
    """Add status + decision metadata to races and results so coaches can
    propose race-side changes that admins approve."""
    from sqlalchemy import inspect
    inspector = inspect(engine)
    # Postgres doesn't know `DATETIME` — it uses `TIMESTAMP`. SQLite accepts both.
    dt_type = "DATETIME" if engine.dialect.name == "sqlite" else "TIMESTAMP"
    if "races" in inspector.get_table_names():
        existing = {c["name"] for c in inspector.get_columns("races")}
        to_add = []
        if "status" not in existing:
            to_add.append(("status", "VARCHAR(20) NOT NULL DEFAULT 'approved'"))
        if "decline_note" not in existing:
            to_add.append(("decline_note", "TEXT"))
        if "decided_at" not in existing:
            to_add.append(("decided_at", dt_type))
        if "decided_by" not in existing:
            to_add.append(("decided_by", "INTEGER REFERENCES users(id)"))
        if to_add:
            with engine.connect() as conn:
                for col, ddl in to_add:
                    conn.execute(text(f"ALTER TABLE races ADD COLUMN {col} {ddl}"))
                try:
                    conn.execute(text("CREATE INDEX ix_races_status ON races(status)"))
                except Exception:
                    pass
                conn.commit()
    if "results" in inspector.get_table_names():
        existing = {c["name"] for c in inspector.get_columns("results")}
        to_add = []
        if "status" not in existing:
            to_add.append(("status", "VARCHAR(20) NOT NULL DEFAULT 'approved'"))
        if "created_by" not in existing:
            to_add.append(("created_by", "INTEGER REFERENCES users(id)"))
        if "decline_note" not in existing:
            to_add.append(("decline_note", "TEXT"))
        if "decided_at" not in existing:
            to_add.append(("decided_at", dt_type))
        if "decided_by" not in existing:
            to_add.append(("decided_by", "INTEGER REFERENCES users(id)"))
        if to_add:
            with engine.connect() as conn:
                for col, ddl in to_add:
                    conn.execute(text(f"ALTER TABLE results ADD COLUMN {col} {ddl}"))
                try:
                    conn.execute(text("CREATE INDEX ix_results_status ON results(status)"))
                except Exception:
                    pass
                conn.commit()


_migrate_race_moderation_columns()


def _migrate_users_bio():
    """Add User.bio column if missing (free-text self-description)."""
    from sqlalchemy import inspect
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    existing = {c["name"] for c in inspector.get_columns("users")}
    if "bio" in existing:
        return
    with engine.connect() as conn:
        conn.execute(text("ALTER TABLE users ADD COLUMN bio TEXT"))
        conn.commit()


_migrate_users_bio()


def _migrate_users_strava():
    """Add Strava OAuth columns to users if missing."""
    from sqlalchemy import inspect
    inspector = inspect(engine)
    if "users" not in inspector.get_table_names():
        return
    existing = {c["name"] for c in inspector.get_columns("users")}
    to_add = [
        ("strava_athlete_id", "INTEGER"),
        ("strava_access_token", "VARCHAR(512)"),
        ("strava_refresh_token", "VARCHAR(512)"),
        ("strava_token_expires_at", "INTEGER"),
    ]
    with engine.connect() as conn:
        added = False
        for col, ddl in to_add:
            if col not in existing:
                conn.execute(text(f"ALTER TABLE users ADD COLUMN {col} {ddl}"))
                added = True
        if added:
            conn.commit()


_migrate_users_strava()


def _migrate_workout_logs_manual_override():
    """Add manual_override column to workout_logs if missing."""
    from sqlalchemy import inspect
    inspector = inspect(engine)
    if "workout_logs" not in inspector.get_table_names():
        return
    existing = {c["name"] for c in inspector.get_columns("workout_logs")}
    if "manual_override" in existing:
        return
    default_clause = "FALSE" if engine.dialect.name != "sqlite" else "0"
    with engine.connect() as conn:
        conn.execute(text(f"ALTER TABLE workout_logs ADD COLUMN manual_override BOOLEAN NOT NULL DEFAULT {default_clause}"))
        conn.commit()


_migrate_workout_logs_manual_override()


def _bootstrap_admin_and_coach_ids():
    """One-time data backfill: promote the original sole coach to admin and
    attach every athlete + training group to them. Idempotent — after the
    first run the WHERE filters match zero rows."""
    from .database import SessionLocal
    from .models.training_group import TrainingGroup
    db = SessionLocal()
    try:
        admin = db.query(User).filter(User.role == "admin").order_by(User.id.asc()).first()
        if admin is None:
            coach = db.query(User).filter(User.role == "coach").order_by(User.id.asc()).first()
            if coach is None:
                return  # fresh DB with no coach yet
            coach.role = "admin"
            admin = coach
            db.commit()
        db.query(User).filter(User.role == "athlete", User.coach_id.is_(None)).update(
            {User.coach_id: admin.id}, synchronize_session=False
        )
        db.query(TrainingGroup).filter(TrainingGroup.coach_id.is_(None)).update(
            {TrainingGroup.coach_id: admin.id}, synchronize_session=False
        )
        db.commit()
    finally:
        db.close()


try:
    _bootstrap_admin_and_coach_ids()
except Exception as e:
    import logging
    logging.warning(f"Bootstrap admin migration failed: {e}")


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
app.include_router(coaching.router, prefix=API_PREFIX)
app.include_router(admin_review.router, prefix=API_PREFIX)
app.include_router(strava.router, prefix=API_PREFIX)
app.include_router(notifications.router, prefix=API_PREFIX)


@app.get("/health")
def health():
    return {"status": "ok"}
