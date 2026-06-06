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
from ..services.coach_scope import visible_group_ids as _visible_group_ids

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


class LoadRow(BaseModel):
    user_id: int
    full_name: str
    group_id: Optional[int]
    group_name: Optional[str]
    current_week_km: float
    avg_prev_km: float          # mean weekly km over the prior weeks (baseline)
    spike_pct: Optional[float]  # % over baseline; None when no baseline history
    is_spike: bool              # spike_pct > threshold
    weekly_km: list[float]      # oldest → newest, including current week


class LoadOverview(BaseModel):
    week_start: date
    week_end: date
    threshold_pct: float
    athletes: list[LoadRow]


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

    visible_group_ids = _visible_group_ids(coach, db, active_team_id)
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
    visible_group_ids = _visible_group_ids(coach, db, active_team_id)

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


@router.get("/load-overview", response_model=LoadOverview)
def load_overview(
    coach: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
    active_team_id: Annotated[Optional[int], Depends(get_active_team_id)],
    group_id: Optional[int] = Query(None),
    week: Optional[str] = Query(None, description="ISO week string: YYYY-WNN (current week)"),
    weeks: int = Query(4, ge=2, le=12, description="Total weeks of history including current"),
    threshold: float = Query(30.0, ge=0, description="Spike threshold percent over baseline"),
):
    """FR-C: weekly km load per athlete with a >threshold% week-over-baseline
    spike flag. Baseline = mean of the prior weeks (excluding current)."""
    week_start, week_end = _week_bounds(week)
    history_start = week_start - timedelta(weeks=weeks - 1)

    visible_group_ids = _visible_group_ids(coach, db, active_team_id)
    if group_id is not None:
        if group_id not in visible_group_ids:
            raise HTTPException(status_code=403, detail="Not a coach of that group")
        visible_group_ids = {group_id}

    groups = {g.id: g for g in db.query(TrainingGroup).filter(
        TrainingGroup.id.in_(visible_group_ids)
    ).all()} if visible_group_ids else {}

    athletes = db.query(User).filter(
        User.training_group_id.in_(visible_group_ids),
        User.role == "athlete",
    ).order_by(User.full_name).all() if visible_group_ids else []

    # Pull every logged km in the window once, then bucket per athlete per week.
    km_by_athlete_week: dict[int, list[float]] = {
        a.id: [0.0] * weeks for a in athletes
    }
    if athletes:
        logs = db.query(WorkoutLog.athlete_id, WorkoutLog.date, WorkoutLog.distance_km).filter(
            WorkoutLog.athlete_id.in_([a.id for a in athletes]),
            WorkoutLog.date >= history_start,
            WorkoutLog.date <= week_end,
            WorkoutLog.distance_km.isnot(None),
        ).all()
        for aid, log_date, km in logs:
            idx = (log_date - history_start).days // 7
            if 0 <= idx < weeks:
                km_by_athlete_week[aid][idx] += km or 0.0

    rows = []
    for athlete in athletes:
        weekly = [round(v, 1) for v in km_by_athlete_week[athlete.id]]
        current = weekly[-1]
        # PRD FR-C: spike is week-over-week — compare against the prior week.
        prev_week = weekly[-2] if len(weekly) >= 2 else 0.0
        avg_prev = prev_week
        # Flag on the raw ratio so a value just over the threshold isn't lost to rounding.
        raw_pct = (current - prev_week) / prev_week * 100 if prev_week > 0 else None
        spike_pct = round(raw_pct, 1) if raw_pct is not None else None
        is_spike = raw_pct is not None and raw_pct > threshold
        group = groups.get(athlete.training_group_id)
        rows.append(LoadRow(
            user_id=athlete.id,
            full_name=athlete.full_name,
            group_id=athlete.training_group_id,
            group_name=group.name if group else None,
            current_week_km=current,
            avg_prev_km=avg_prev,
            spike_pct=spike_pct,
            is_spike=is_spike,
            weekly_km=weekly,
        ))

    # Spiking athletes first, then by how big the spike is.
    rows.sort(key=lambda r: (not r.is_spike, -(r.spike_pct or 0)))

    return LoadOverview(
        week_start=week_start, week_end=week_end,
        threshold_pct=threshold, athletes=rows,
    )
