from __future__ import annotations
from datetime import date, timedelta
from typing import Optional
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..models.workout import WorkoutLog
from ..models.race import Race, Heat, Result
from ..models.training_group import TrainingGroup
from ..schemas.workout import DayData
from ..services.time_utils import seconds_to_display
from .calendar import _build_week, _week_start

router = APIRouter(prefix="/home", tags=["home"])


class LastRaceOut(BaseModel):
    id: int
    name: str
    date: date
    result_time_str: str
    distance_label: str


class GroupOut(BaseModel):
    id: int
    name: str


class HomeSummary(BaseModel):
    today: Optional[DayData]
    week_distance_km: float
    runs_completed_week: int
    runs_completed_month: int
    runs_completed_total: int
    last_race: Optional[LastRaceOut]
    group: Optional[GroupOut]


@router.get("/summary", response_model=HomeSummary)
def home_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    ws = _week_start(today)

    # Today's DayData — reuse the calendar week-builder, then pluck today's slot
    week = _build_week(
        current_user, ws, db,
        is_coach=current_user.role == "coach",
        viewer_id=current_user.id,
    )
    today_data = next((d for d in week.days if d.date == today), None)

    # Weekly km — sum of distances logged Sun→Sat of the current week
    week_end = ws + timedelta(days=6)
    week_distance = db.query(sa_func.coalesce(sa_func.sum(WorkoutLog.distance_km), 0.0)).filter(
        WorkoutLog.athlete_id == current_user.id,
        WorkoutLog.date >= ws,
        WorkoutLog.date <= week_end,
    ).scalar() or 0.0

    # Run counts (completed only): week / month / all-time
    def _count(start: Optional[date] = None) -> int:
        q = db.query(sa_func.count(WorkoutLog.id)).filter(
            WorkoutLog.athlete_id == current_user.id,
            WorkoutLog.status == "completed",
        )
        if start is not None:
            q = q.filter(WorkoutLog.date >= start)
        return int(q.scalar() or 0)

    month_start = today.replace(day=1)
    runs_week = _count(ws)
    runs_month = _count(month_start)
    runs_total = _count(None)

    # Last race — Result → Heat → Race, exclude manual-PB shadow races
    last_race_row = (
        db.query(Race, Heat, Result)
        .join(Heat, Heat.race_id == Race.id)
        .join(Result, Result.heat_id == Heat.id)
        .filter(
            Result.user_id == current_user.id,
            Race.is_manual.is_(False),
        )
        .order_by(Race.race_date.desc(), Result.time_seconds.asc())
        .first()
    )
    last_race = None
    if last_race_row:
        race, heat, result = last_race_row
        last_race = LastRaceOut(
            id=race.id,
            name=race.name,
            date=race.race_date,
            result_time_str=seconds_to_display(result.time_seconds),
            distance_label=heat.label or f"{heat.distance_m} m",
        )

    # Group
    group_out = None
    if current_user.training_group_id:
        tg = db.get(TrainingGroup, current_user.training_group_id)
        if tg:
            group_out = GroupOut(id=tg.id, name=tg.name)

    return HomeSummary(
        today=today_data,
        week_distance_km=round(float(week_distance), 1),
        runs_completed_week=runs_week,
        runs_completed_month=runs_month,
        runs_completed_total=runs_total,
        last_race=last_race,
        group=group_out,
    )
