from __future__ import annotations
from datetime import date
from typing import List, Optional
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..models.team import Team
from ..models.hall_of_fame import HallOfFame
from ..models.race import Result, Heat, Race, CANONICAL_DISTANCES
from ..services.time_utils import seconds_to_display, format_pace


class PublicHoFEntry(BaseModel):
    rank: int
    athlete_name: str
    time_display: str
    pace_display: str
    achieved_date: date


class PublicHoFDistance(BaseModel):
    distance_m: int
    men: List[PublicHoFEntry]
    women: List[PublicHoFEntry]


class PublicResult(BaseModel):
    athlete_name: str
    distance_m: int
    time_display: str
    race_name: str
    race_date: date


class PublicTeamProfile(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    sport: Optional[str] = None
    location: Optional[str] = None
    hall_of_fame: List[PublicHoFDistance]
    recent_results: List[PublicResult]


def build_team_profile(db: Session, team: Team) -> PublicTeamProfile:
    """Aggregate a team's public-facing profile (Hall of Fame + recent results).
    Shared by the in-app "My Group" view (athlete) and the coach's Profile tab.
    No visibility gate here — callers decide who may view it."""
    team_id = team.id

    # Hall of Fame — top entries per distance × gender for this team. One query
    # for all distances, grouped in memory (this runs on every My Group open and
    # the coach's default Profile tab, so avoid a query per distance).
    all_entries = (
        db.query(HallOfFame)
        .filter(
            HallOfFame.team_id == team_id,
            HallOfFame.distance_m.in_(CANONICAL_DISTANCES),
        )
        .all()
    )
    by_distance: dict[int, list[HallOfFame]] = {}
    for e in all_entries:
        by_distance.setdefault(e.distance_m, []).append(e)

    def to_entry(e: HallOfFame) -> PublicHoFEntry:
        return PublicHoFEntry(
            rank=e.rank,
            athlete_name=e.athlete_name,
            time_display=seconds_to_display(e.time_seconds),
            pace_display=format_pace(e.time_seconds, e.distance_m),
            achieved_date=e.achieved_date,
        )

    hof: List[PublicHoFDistance] = []
    for dist in CANONICAL_DISTANCES:
        entries = by_distance.get(dist, [])
        men = sorted([to_entry(e) for e in entries if e.gender == "M"], key=lambda x: x.rank)
        women = sorted([to_entry(e) for e in entries if e.gender == "F"], key=lambda x: x.rank)
        if men or women:
            hof.append(PublicHoFDistance(distance_m=dist, men=men, women=women))

    # Recent verified results — the team's approved global races only.
    rows = (
        db.query(Result, Heat, Race)
        .join(Heat, Result.heat_id == Heat.id)
        .join(Race, Heat.race_id == Race.id)
        .filter(
            Race.team_id == team_id,
            Race.scope == "global",
            Race.status == "approved",
            Result.status == "approved",
        )
        .order_by(Race.race_date.desc(), Result.time_seconds.asc())
        .limit(10)
        .all()
    )
    recent = [
        PublicResult(
            athlete_name=r.athlete_name,
            distance_m=h.distance_m,
            time_display=seconds_to_display(r.time_seconds),
            race_name=race.name,
            race_date=race.race_date,
        )
        for r, h, race in rows
    ]

    return PublicTeamProfile(
        id=team.id,
        name=team.name,
        description=team.description,
        sport=team.sport,
        location=team.location,
        hall_of_fame=hof,
        recent_results=recent,
    )
