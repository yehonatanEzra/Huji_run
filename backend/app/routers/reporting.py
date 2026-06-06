"""FR-B: Athlete reporting overview + auto-alerts (Sprint 1)."""
from datetime import date, timedelta
from typing import Annotated, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db, SessionLocal
from ..dependencies import require_coach, get_active_team_id
from ..models.user import User
from ..models.workout import WorkoutLog
from ..models.training_group import TrainingGroup
from ..services.notifications import notify_many

router = APIRouter(prefix="/reporting", tags=["reporting"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class AthleteReportRow(BaseModel):
    user_id: int
    full_name: str
    group_id: Optional[int]
    group_name: Optional[str]
    days_logged: int
    total_days: int
    response_rate: float


class ReportingOverview(BaseModel):
    week_start: date
    week_end: date
    athletes: list[AthleteReportRow]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _week_bounds(week_str: Optional[str]) -> tuple[date, date]:
    """Parse 'YYYY-WNN' or default to current ISO week. Returns (monday, sunday)."""
    if week_str:
        try:
            year_str, wnum_str = week_str.split("-W")
            monday = date.fromisocalendar(int(year_str), int(wnum_str), 1)
        except (ValueError, AttributeError):
            raise HTTPException(status_code=422, detail="week must be YYYY-WNN (e.g. 2026-W23)")
    else:
        today = date.today()
        monday = today - timedelta(days=today.weekday())
    return monday, monday + timedelta(days=6)


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/overview", response_model=ReportingOverview)
def reporting_overview(
    coach: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
    active_team_id: Annotated[Optional[int], Depends(get_active_team_id)],
    group_id: Optional[int] = Query(None),
    week: Optional[str] = Query(None, description="ISO week string: YYYY-WNN"),
):
    week_start, week_end = _week_bounds(week)

    # Determine which groups this coach can see.
    from ..models.group_coach import GroupCoach
    if coach.role == "admin":
        group_ids_q = db.query(TrainingGroup.id)
        if active_team_id:
            group_ids_q = group_ids_q.filter(TrainingGroup.team_id == active_team_id)
        visible_group_ids = {row[0] for row in group_ids_q.all()}
    else:
        visible_group_ids = {
            row[0] for row in db.query(GroupCoach.group_id)
            .filter(GroupCoach.user_id == coach.id).all()
        }

    if group_id is not None:
        if group_id not in visible_group_ids:
            raise HTTPException(status_code=403, detail="Not a coach of that group")
        visible_group_ids = {group_id}

    # Load group info for display.
    groups = {g.id: g for g in db.query(TrainingGroup).filter(
        TrainingGroup.id.in_(visible_group_ids)
    ).all()} if visible_group_ids else {}

    # Load athletes in those groups.
    athletes = db.query(User).filter(
        User.training_group_id.in_(visible_group_ids),
        User.role == "athlete",
    ).order_by(User.full_name).all() if visible_group_ids else []

    # Count logged days per athlete in the week window.
    log_counts: dict[int, int] = {}
    if athletes:
        logs = db.query(WorkoutLog.athlete_id).filter(
            WorkoutLog.athlete_id.in_([a.id for a in athletes]),
            WorkoutLog.date >= week_start,
            WorkoutLog.date <= week_end,
            WorkoutLog.status != "missed",
        ).all()
        for (aid,) in logs:
            log_counts[aid] = log_counts.get(aid, 0) + 1

    total_days = (week_end - week_start).days + 1

    rows = []
    for athlete in athletes:
        logged = log_counts.get(athlete.id, 0)
        group = groups.get(athlete.training_group_id)
        rows.append(AthleteReportRow(
            user_id=athlete.id,
            full_name=athlete.full_name,
            group_id=athlete.training_group_id,
            group_name=group.name if group else None,
            days_logged=logged,
            total_days=total_days,
            response_rate=round(logged / total_days, 2),
        ))

    # Sort by response_rate ascending (laggards first).
    rows.sort(key=lambda r: r.response_rate)

    return ReportingOverview(week_start=week_start, week_end=week_end, athletes=rows)


@router.post("/alert-non-loggers", status_code=202)
def alert_non_loggers(
    background_tasks: BackgroundTasks,
    coach: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
    active_team_id: Annotated[Optional[int], Depends(get_active_team_id)],
    days: int = Query(3, ge=1, le=14, description="Flag athletes silent for this many days"),
):
    """FR-B2: Send push notification to athletes who haven't logged in `days` days."""
    from ..models.group_coach import GroupCoach
    if coach.role == "admin":
        group_ids_q = db.query(TrainingGroup.id)
        if active_team_id:
            group_ids_q = group_ids_q.filter(TrainingGroup.team_id == active_team_id)
        visible_group_ids = {row[0] for row in group_ids_q.all()}
    else:
        visible_group_ids = {
            row[0] for row in db.query(GroupCoach.group_id)
            .filter(GroupCoach.user_id == coach.id).all()
        }

    since = date.today() - timedelta(days=days)
    athletes = db.query(User).filter(
        User.training_group_id.in_(visible_group_ids),
        User.role == "athlete",
    ).all() if visible_group_ids else []

    logged_recently = {
        row[0] for row in db.query(WorkoutLog.athlete_id).filter(
            WorkoutLog.athlete_id.in_([a.id for a in athletes]),
            WorkoutLog.date >= since,
            WorkoutLog.status != "missed",
        ).all()
    } if athletes else set()

    silent_ids = [a.id for a in athletes if a.id not in logged_recently]

    if silent_ids:
        # Background tasks run after the response is sent and the request-scoped
        # db session is already closed. Use a fresh session + explicit commit.
        def _send(ids=silent_ids, d=days):
            task_db = SessionLocal()
            try:
                notify_many(task_db, ids, "log_reminder",
                            f"You haven't logged a workout in {d} days — how's training going?",
                            "/calendar")
                task_db.commit()
            finally:
                task_db.close()
        background_tasks.add_task(_send)

    return {"alerted": len(silent_ids)}
