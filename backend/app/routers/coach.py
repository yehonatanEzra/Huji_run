from datetime import date, timedelta
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import require_coach
from ..models.user import User
from ..models.workout import WorkoutLog
from ..schemas.auth import UserOut
from ..schemas.workout import CoachDashboardResponse, AthleteWeekRow, WorkoutLogOut

router = APIRouter(prefix="/coach", tags=["coach"])


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


@router.get("/athletes", response_model=list[UserOut])
def list_athletes(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_coach)],
):
    return db.query(User).filter(User.role == "athlete").order_by(User.full_name).all()


@router.get("/athletes/search")
def search_athletes(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    _: User = Depends(require_coach),
):
    results = (
        db.query(User)
        .filter(User.role == "athlete", User.full_name.ilike(f"{q}%"))
        .order_by(User.full_name)
        .limit(10)
        .all()
    )
    return [{"id": u.id, "full_name": u.full_name, "gender": u.gender} for u in results]


@router.get("/dashboard/week", response_model=CoachDashboardResponse)
def dashboard_week(
    day: date = Query(default_factory=date.today),
    db: Session = Depends(get_db),
    _: User = Depends(require_coach),
):
    ws = _week_start(day)
    week_dates = [ws + timedelta(days=i) for i in range(7)]

    athletes = db.query(User).filter(User.role == "athlete").order_by(User.full_name).all()

    # Fetch all logs for the week in one query
    logs = db.query(WorkoutLog).filter(
        WorkoutLog.date.in_(week_dates)
    ).all()
    log_map: dict[tuple, WorkoutLog] = {(l.athlete_id, l.date): l for l in logs}

    rows = []
    for athlete in athletes:
        days = []
        for d in week_dates:
            log = log_map.get((athlete.id, d))
            days.append({
                "date": d,
                "log": WorkoutLogOut.model_validate(log) if log else None,
            })
        rows.append(AthleteWeekRow(
            id=athlete.id,
            full_name=athlete.full_name,
            gender=athlete.gender,
            days=days,
        ))

    return CoachDashboardResponse(week_start=ws, athletes=rows)
