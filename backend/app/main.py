import logging
import structlog
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from .config import settings
from .database import engine, Base

structlog.configure(
    processors=[
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.stdlib.BoundLogger,
    context_class=dict,
    logger_factory=structlog.PrintLoggerFactory(),
)
# Route stdlib logging through structlog so uvicorn/sqlalchemy logs are structured too
logging.basicConfig(format="%(message)s", level=logging.WARNING)

log = structlog.get_logger()
from .models import User, TrainingGroup, GroupWorkout, IndividualTarget, WorkoutLog, Race, Heat, Result, RaceRegistration, HallOfFame, HealthProfessional, HealthReview, Kudos, Announcement, AnnouncementReaction, AnnouncementComment, Challenge
from .models.workout import WorkoutLogComment  # noqa: F401
from .models.notification import Notification  # noqa: F401
from .models.team import Team, TeamMembership  # noqa: F401
from .models.group_coach import GroupCoach  # noqa: F401
from .models.group_add_request import GroupAddRequest  # noqa: F401
from .models.group_coach_invite import GroupCoachInvite  # noqa: F401
from .models.athlete_transfer import AthleteTransfer  # noqa: F401
from .models.info_section import InfoSection  # noqa: F401
from .models.workout_template import WorkoutTemplate, WorkoutTemplateDay  # noqa: F401
from .models.goal import Goal  # noqa: F401
from .routers import auth, calendar, races, leaderboard, profile, coach, kudos
from .routers import health_wellness, feed, challenges, workout_comments, home, coaching, admin_review, admin_users, strava, notifications, stats, teams, group_coach, reporting, analytics, workout_templates, goals, public, info

Base.metadata.create_all(bind=engine)


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
            coach_user = db.query(User).filter(User.role == "coach").order_by(User.id.asc()).first()
            if coach_user is None:
                return  # fresh DB with no coach yet
            coach_user.role = "admin"
            admin = coach_user
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


def _seed_info_sections():
    """Seed the Info-page rulebook once, if empty. Idempotent — after the first
    run the count is non-zero and this returns immediately."""
    from .database import SessionLocal
    from .models.info_section import InfoSection
    from .services.info_seed import DEFAULT_SECTIONS
    db = SessionLocal()
    try:
        if db.query(InfoSection).count() > 0:
            return
        for s in DEFAULT_SECTIONS:
            db.add(InfoSection(**s))
        db.commit()
    finally:
        db.close()


try:
    _bootstrap_admin_and_coach_ids()
except Exception as e:
    log.warning("bootstrap_admin_failed", error=str(e))


try:
    _seed_info_sections()
except Exception as e:
    log.warning("seed_info_sections_failed", error=str(e))



app = FastAPI(title="Huji Run API", version="1.0.0")


@app.middleware("http")
async def log_requests(request: Request, call_next):
    response = await call_next(request)
    log.info("request", method=request.method, path=request.url.path, status=response.status_code)
    return response


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
app.include_router(admin_users.router, prefix=API_PREFIX)
app.include_router(strava.router, prefix=API_PREFIX)
app.include_router(notifications.router, prefix=API_PREFIX)
app.include_router(stats.router, prefix=API_PREFIX)
app.include_router(teams.router, prefix=API_PREFIX)
app.include_router(group_coach.router, prefix=API_PREFIX)
app.include_router(reporting.router, prefix=API_PREFIX)
app.include_router(analytics.router, prefix=API_PREFIX)
app.include_router(workout_templates.router, prefix=API_PREFIX)
app.include_router(goals.router, prefix=API_PREFIX)
app.include_router(public.router, prefix=API_PREFIX)
app.include_router(info.router, prefix=API_PREFIX)


@app.get("/health")
def health():
    return {"status": "ok"}
