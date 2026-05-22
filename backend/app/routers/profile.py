from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user, require_coach
from ..models.user import User
from ..models.race import Result, Heat, Race, CANONICAL_DISTANCES
from ..schemas.profile import ProfileResponse, PBEntry, RaceHistoryEntry
from ..services.time_utils import seconds_to_display, format_pace

router = APIRouter(prefix="/profile", tags=["profile"])


def _build_profile(user: User, db: Session) -> ProfileResponse:
    # Personal bests: min time per canonical distance
    pb_rows = (
        db.query(Heat.distance_m, func.min(Result.time_seconds).label("best_sec"))
        .join(Result, Result.heat_id == Heat.id)
        .filter(Result.user_id == user.id, Heat.distance_m.in_(CANONICAL_DISTANCES))
        .group_by(Heat.distance_m)
        .all()
    )

    personal_bests = []
    for dist, best_sec in pb_rows:
        # Find the race that produced this PB
        pb_result = (
            db.query(Result, Heat, Race)
            .join(Heat, Result.heat_id == Heat.id)
            .join(Race, Heat.race_id == Race.id)
            .filter(
                Result.user_id == user.id,
                Heat.distance_m == dist,
                Result.time_seconds == best_sec,
            )
            .order_by(Race.race_date.asc())
            .first()
        )
        if pb_result:
            r, h, race = pb_result
            personal_bests.append(PBEntry(
                distance_m=dist,
                time_seconds=best_sec,
                time_display=seconds_to_display(best_sec),
                pace_display=format_pace(best_sec, dist),
                achieved_date=race.race_date,
                race_name=race.name,
            ))

    # Full race history
    history_rows = (
        db.query(Result, Heat, Race)
        .join(Heat, Result.heat_id == Heat.id)
        .join(Race, Heat.race_id == Race.id)
        .filter(Result.user_id == user.id)
        .order_by(Race.race_date.desc())
        .all()
    )

    race_history = []
    for r, h, race in history_rows:
        siblings = sorted(
            db.query(Result).filter(Result.heat_id == h.id).all(),
            key=lambda x: x.time_seconds,
        )
        placement = next((i + 1 for i, s in enumerate(siblings) if s.id == r.id), 0)
        race_history.append(RaceHistoryEntry(
            race_id=race.id,
            race_name=race.name,
            race_date=race.race_date,
            distance_m=h.distance_m,
            heat_label=h.label,
            time_seconds=r.time_seconds,
            time_display=seconds_to_display(r.time_seconds),
            pace_display=format_pace(r.time_seconds, h.distance_m),
            placement=placement,
        ))

    return ProfileResponse(
        user_id=user.id,
        full_name=user.full_name,
        gender=user.gender,
        personal_bests=sorted(personal_bests, key=lambda x: x.distance_m),
        race_history=race_history,
    )


@router.get("/me", response_model=ProfileResponse)
def my_profile(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    return _build_profile(current_user, db)


@router.get("/{user_id}", response_model=ProfileResponse)
def athlete_profile(
    user_id: int,
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_coach)],
):
    user = db.get(User, user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return _build_profile(user, db)
