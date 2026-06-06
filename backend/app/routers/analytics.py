"""FR-G: team-level analytics for coaches — volume, completion, type mix."""
from datetime import date, timedelta
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import func
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import require_coach, get_active_team_id
from ..models.user import User
from ..models.workout import WorkoutLog, GroupWorkout
from ..services.coach_scope import visible_group_ids as _visible_group_ids

router = APIRouter(prefix="/analytics", tags=["analytics"])


# ── Schemas ───────────────────────────────────────────────────────────────────

class VolumeBucket(BaseModel):
    start: date
    label: str
    total_km: float
    avg_km: float        # total / athletes who logged anything that week


class AthleteVolumeSeries(BaseModel):
    user_id: int
    full_name: str
    weekly_km: list[float]   # aligned to buckets, oldest → newest


class VolumeTrend(BaseModel):
    weeks: int
    athlete_count: int
    buckets: list[VolumeBucket]
    athletes: list[AthleteVolumeSeries]   # per-athlete weekly series (FR-G)


class CompletionBucket(BaseModel):
    start: date
    label: str
    rate: float          # mean per-athlete (non-missed days / 7)


class CompletionTrend(BaseModel):
    weeks: int
    athlete_count: int
    buckets: list[CompletionBucket]


class TypeSlice(BaseModel):
    workout_type: str
    count: int


class TypeBreakdown(BaseModel):
    days: int
    total: int
    slices: list[TypeSlice]


# ── Helpers ───────────────────────────────────────────────────────────────────

def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _scoped_athlete_ids(coach, db, active_team_id, group_id) -> list[int]:
    visible = _visible_group_ids(coach, db, active_team_id)
    if group_id is not None:
        if group_id not in visible:
            raise HTTPException(status_code=403, detail="Not a coach of that group")
        visible = {group_id}
    if not visible:
        return []
    return [
        row[0] for row in db.query(User.id).filter(
            User.training_group_id.in_(visible),
            User.role == "athlete",
        ).all()
    ]


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("/volume", response_model=VolumeTrend)
def team_volume(
    coach: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
    active_team_id: Annotated[Optional[int], Depends(get_active_team_id)],
    group_id: Optional[int] = Query(None),
    weeks: int = Query(12, ge=2, le=26),
):
    """Total + average weekly km across the coach's athletes, plus a per-athlete series."""
    athlete_ids = _scoped_athlete_ids(coach, db, active_team_id, group_id)
    starts = [_monday(date.today()) - timedelta(weeks=weeks - 1 - i) for i in range(weeks)]
    index_of = {s: i for i, s in enumerate(starts)}
    totals = {s: 0.0 for s in starts}
    loggers = {s: set() for s in starts}
    per_athlete = {aid: [0.0] * weeks for aid in athlete_ids}

    if athlete_ids:
        rows = db.query(WorkoutLog.athlete_id, WorkoutLog.date, WorkoutLog.distance_km).filter(
            WorkoutLog.athlete_id.in_(athlete_ids),
            WorkoutLog.date >= starts[0],
            WorkoutLog.date <= starts[-1] + timedelta(days=6),
            WorkoutLog.distance_km.isnot(None),
        ).all()
        for aid, d, km in rows:
            ws = _monday(d)
            if ws in totals:
                totals[ws] += km or 0.0
                if km:
                    loggers[ws].add(aid)
                    per_athlete[aid][index_of[ws]] += km

    buckets = [
        VolumeBucket(
            start=s, label=s.strftime("%b %d"),
            total_km=round(totals[s], 1),
            avg_km=round(totals[s] / len(loggers[s]), 1) if loggers[s] else 0.0,
        )
        for s in starts
    ]
    # Names for the per-athlete series; only include athletes with any logged km.
    names = dict(db.query(User.id, User.full_name).filter(User.id.in_(athlete_ids)).all()) if athlete_ids else {}
    athletes = [
        AthleteVolumeSeries(
            user_id=aid, full_name=names.get(aid, "Unknown"),
            weekly_km=[round(v, 1) for v in series],
        )
        for aid, series in per_athlete.items() if any(series)
    ]
    athletes.sort(key=lambda a: a.full_name)
    return VolumeTrend(weeks=weeks, athlete_count=len(athlete_ids), buckets=buckets, athletes=athletes)


@router.get("/completion", response_model=CompletionTrend)
def team_completion(
    coach: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
    active_team_id: Annotated[Optional[int], Depends(get_active_team_id)],
    group_id: Optional[int] = Query(None),
    weeks: int = Query(8, ge=2, le=26),
):
    """Mean per-athlete weekly response rate (non-missed days / 7)."""
    athlete_ids = _scoped_athlete_ids(coach, db, active_team_id, group_id)
    starts = [_monday(date.today()) - timedelta(weeks=weeks - 1 - i) for i in range(weeks)]
    # per week: {athlete_id: count of non-missed logged days}
    counts = {s: {} for s in starts}

    if athlete_ids:
        rows = db.query(WorkoutLog.athlete_id, WorkoutLog.date).filter(
            WorkoutLog.athlete_id.in_(athlete_ids),
            WorkoutLog.date >= starts[0],
            WorkoutLog.date <= starts[-1] + timedelta(days=6),
            WorkoutLog.status != "missed",
        ).all()
        for aid, d in rows:
            ws = _monday(d)
            if ws in counts:
                counts[ws][aid] = counts[ws].get(aid, 0) + 1

    n = len(athlete_ids)
    buckets = []
    for s in starts:
        # Average over ALL scoped athletes (silent ones count as 0).
        rate = sum(min(c, 7) / 7 for c in counts[s].values()) / n if n else 0.0
        buckets.append(CompletionBucket(start=s, label=s.strftime("%b %d"), rate=round(rate, 2)))
    return CompletionTrend(weeks=weeks, athlete_count=n, buckets=buckets)


@router.get("/type-breakdown", response_model=TypeBreakdown)
def type_breakdown(
    coach: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
    active_team_id: Annotated[Optional[int], Depends(get_active_team_id)],
    group_id: Optional[int] = Query(None),
    days: int = Query(30, ge=7, le=180),
):
    """Distribution of planned workout types across the coach's groups."""
    visible = _visible_group_ids(coach, db, active_team_id)
    if group_id is not None:
        if group_id not in visible:
            raise HTTPException(status_code=403, detail="Not a coach of that group")
        visible = {group_id}

    since = date.today() - timedelta(days=days)
    slices: list[TypeSlice] = []
    total = 0
    if visible:
        rows = db.query(GroupWorkout.workout_type, func.count(GroupWorkout.id)).filter(
            GroupWorkout.training_group_id.in_(visible),
            GroupWorkout.date >= since,
        ).group_by(GroupWorkout.workout_type).all()
        for wtype, count in sorted(rows, key=lambda r: -r[1]):
            slices.append(TypeSlice(workout_type=wtype, count=count))
            total += count
    return TypeBreakdown(days=days, total=total, slices=slices)
