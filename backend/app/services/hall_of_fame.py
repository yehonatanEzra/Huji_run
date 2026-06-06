from typing import Optional
from sqlalchemy.orm import Session
from ..models.race import Result, Heat, Race, CANONICAL_DISTANCES
from ..models.hall_of_fame import HallOfFame


def refresh_hall_of_fame(
    db: Session,
    distance_m: int,
    gender: str,
    team_id: Optional[int] = None,
) -> None:
    """Recompute and cache the top-3 for a given distance+gender.

    When team_id is supplied the query and HoF rows are scoped to that team;
    without it the function scans all data (legacy / test path).
    """
    q = (
        db.query(Result, Heat, Race)
        .join(Heat, Result.heat_id == Heat.id)
        .join(Race, Heat.race_id == Race.id)
        .filter(
            Heat.distance_m == distance_m,
            Result.gender == gender,
            Result.status == "approved",
            Race.status == "approved",
        )
    )
    if team_id is not None:
        q = q.filter(Race.team_id == team_id)

    all_results = q.order_by(Result.time_seconds.asc()).all()

    seen: set = set()
    top3 = []
    for result, heat, race in all_results:
        key = result.user_id or result.athlete_name
        if key in seen:
            continue
        seen.add(key)
        top3.append((result, heat, race))
        if len(top3) >= 3:
            break

    hof_q = db.query(HallOfFame).filter_by(distance_m=distance_m, gender=gender)
    if team_id is not None:
        hof_q = hof_q.filter(HallOfFame.team_id == team_id)
    hof_q.delete()

    for rank, (result, heat, race) in enumerate(top3, start=1):
        entry = HallOfFame(
            team_id=team_id,
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


def refresh_team_hall_of_fame(db: Session, team_id: int) -> None:
    """Full HoF refresh for one team across all canonical distances and genders."""
    for distance_m in CANONICAL_DISTANCES:
        for gender in ("M", "F"):
            refresh_hall_of_fame(db, distance_m, gender, team_id=team_id)
