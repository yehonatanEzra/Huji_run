from sqlalchemy.orm import Session
from ..models.race import Result, Heat, Race
from ..models.hall_of_fame import HallOfFame


def refresh_hall_of_fame(db: Session, distance_m: int, gender: str) -> None:
    """Recompute and cache the top-3 for a given distance+gender."""
    top3 = (
        db.query(Result, Heat, Race)
        .join(Heat, Result.heat_id == Heat.id)
        .join(Race, Heat.race_id == Race.id)
        .filter(Heat.distance_m == distance_m, Result.gender == gender)
        .order_by(Result.time_seconds.asc())
        .limit(3)
        .all()
    )

    db.query(HallOfFame).filter_by(distance_m=distance_m, gender=gender).delete()

    for rank, (result, heat, race) in enumerate(top3, start=1):
        entry = HallOfFame(
            distance_m=distance_m,
            gender=gender,
            rank=rank,
            user_id=result.user_id,
            athlete_name=result.athlete_name,
            time_seconds=result.time_seconds,
            race_id=race.id,
            heat_id=heat.id,
            achieved_date=race.race_date,
        )
        db.add(entry)

    db.flush()
