from datetime import date, timedelta
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, Query
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..models.training_group import TrainingGroup
from ..models.hall_of_fame import HallOfFame
from ..models.workout import WorkoutLog
from ..models.race import Result, Heat, Race, CANONICAL_DISTANCES
from ..schemas.profile import HallOfFameEntry, HallOfFameDistance, HallOfFameResponse
from ..services.time_utils import seconds_to_display, format_pace

router = APIRouter(prefix="/hall-of-fame", tags=["hall-of-fame"])


@router.get("/groups")
def get_hof_groups(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    if current_user.role == "coach":
        groups = db.query(TrainingGroup).order_by(TrainingGroup.name).all()
        return [{"id": g.id, "name": g.name} for g in groups]
    if current_user.training_group_id:
        group = db.get(TrainingGroup, current_user.training_group_id)
        if group:
            return [{"id": group.id, "name": group.name}]
    return []


@router.get("", response_model=HallOfFameResponse)
def get_hall_of_fame(
    group_id: Optional[int] = Query(None),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    if group_id is None:
        return _get_overall_hof(db)
    return _get_group_hof(db, group_id)


def _get_overall_hof(db: Session) -> HallOfFameResponse:
    distances = []
    for dist in CANONICAL_DISTANCES:
        entries = db.query(HallOfFame).filter(HallOfFame.distance_m == dist).all()

        def to_entry(e: HallOfFame) -> HallOfFameEntry:
            return HallOfFameEntry(
                rank=e.rank,
                athlete_name=e.athlete_name,
                time_seconds=e.time_seconds,
                time_display=seconds_to_display(e.time_seconds),
                pace_display=format_pace(e.time_seconds, dist),
                achieved_date=e.achieved_date,
                race_id=e.race_id,
            )

        men = sorted([to_entry(e) for e in entries if e.gender == "M"], key=lambda x: x.rank)
        women = sorted([to_entry(e) for e in entries if e.gender == "F"], key=lambda x: x.rank)
        distances.append(HallOfFameDistance(distance_m=dist, men=men, women=women))

    return HallOfFameResponse(distances=distances)


def _get_group_hof(db: Session, group_id: int) -> HallOfFameResponse:
    group_user_ids = [
        u.id for u in db.query(User).filter(User.training_group_id == group_id).all()
    ]

    distances = []
    for dist in CANONICAL_DISTANCES:
        all_results = (
            db.query(Result, Heat, Race)
            .join(Heat, Result.heat_id == Heat.id)
            .join(Race, Heat.race_id == Race.id)
            .filter(Heat.distance_m == dist, Result.user_id.in_(group_user_ids))
            .order_by(Result.time_seconds.asc())
            .all()
        ) if group_user_ids else []

        def build_top3(gender: str):
            filtered = [(r, h, race) for r, h, race in all_results if r.gender == gender]
            seen = set()
            top = []
            for r, h, race in filtered:
                key = r.user_id or r.athlete_name
                if key in seen:
                    continue
                seen.add(key)
                top.append(HallOfFameEntry(
                    rank=len(top) + 1,
                    athlete_name=r.athlete_name,
                    time_seconds=r.time_seconds,
                    time_display=seconds_to_display(r.time_seconds),
                    pace_display=format_pace(r.time_seconds, dist),
                    achieved_date=race.race_date,
                    race_id=race.id,
                ))
                if len(top) >= 3:
                    break
            return top

        distances.append(HallOfFameDistance(distance_m=dist, men=build_top3("M"), women=build_top3("F")))

    return HallOfFameResponse(distances=distances)


def _week_start(d: date) -> date:
    return d - timedelta(days=(d.weekday() + 1) % 7)


@router.get("/km-leaders")
def get_km_leaders(
    group_id: Optional[int] = Query(None),
    gender: Optional[str] = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    today = date.today()
    ws = _week_start(today)
    week_dates = [ws + timedelta(days=i) for i in range(7)]

    month_start = today.replace(day=1)
    next_month = (today.replace(day=28) + timedelta(days=4)).replace(day=1)

    athlete_filter_ids = None
    user_q = db.query(User)
    if group_id is not None:
        user_q = user_q.filter(User.training_group_id == group_id)
    if gender is not None:
        user_q = user_q.filter(User.gender == gender)
    if group_id is not None or gender is not None:
        athlete_filter_ids = [u.id for u in user_q.all()]

    week_q = (
        db.query(
            WorkoutLog.athlete_id,
            sa_func.sum(WorkoutLog.distance_km).label("total_km"),
        )
        .filter(WorkoutLog.date.in_(week_dates), WorkoutLog.distance_km.isnot(None))
    )
    if athlete_filter_ids is not None:
        week_q = week_q.filter(WorkoutLog.athlete_id.in_(athlete_filter_ids))
    week_rows = (
        week_q.group_by(WorkoutLog.athlete_id)
        .order_by(sa_func.sum(WorkoutLog.distance_km).desc())
        .limit(10)
        .all()
    )

    month_q = (
        db.query(
            WorkoutLog.athlete_id,
            sa_func.sum(WorkoutLog.distance_km).label("total_km"),
        )
        .filter(
            WorkoutLog.date >= month_start,
            WorkoutLog.date < next_month,
            WorkoutLog.distance_km.isnot(None),
        )
    )
    if athlete_filter_ids is not None:
        month_q = month_q.filter(WorkoutLog.athlete_id.in_(athlete_filter_ids))
    month_rows = (
        month_q.group_by(WorkoutLog.athlete_id)
        .order_by(sa_func.sum(WorkoutLog.distance_km).desc())
        .limit(10)
        .all()
    )

    user_ids = set(r[0] for r in week_rows) | set(r[0] for r in month_rows)
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}

    def to_list(rows):
        result = []
        for rank, (athlete_id, total_km) in enumerate(rows, 1):
            u = users.get(athlete_id)
            if not u:
                continue
            result.append({
                "rank": rank,
                "athlete_name": u.full_name,
                "total_km": round(total_km, 1),
            })
        return result

    return {
        "week_start": ws.isoformat(),
        "month": today.strftime("%B %Y"),
        "weekly": to_list(week_rows),
        "monthly": to_list(month_rows),
    }
