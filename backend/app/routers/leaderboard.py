from typing import Annotated
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..models.hall_of_fame import HallOfFame
from ..models.race import CANONICAL_DISTANCES
from ..schemas.profile import HallOfFameEntry, HallOfFameDistance, HallOfFameResponse
from ..services.time_utils import seconds_to_display, format_pace

router = APIRouter(prefix="/hall-of-fame", tags=["hall-of-fame"])


@router.get("", response_model=HallOfFameResponse)
def get_hall_of_fame(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(get_current_user)],
):
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

        men = sorted(
            [to_entry(e) for e in entries if e.gender == "M"],
            key=lambda x: x.rank,
        )
        women = sorted(
            [to_entry(e) for e in entries if e.gender == "F"],
            key=lambda x: x.rank,
        )
        distances.append(HallOfFameDistance(distance_m=dist, men=men, women=women))

    return HallOfFameResponse(distances=distances)
