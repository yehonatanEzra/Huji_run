from __future__ import annotations
from datetime import date
from typing import Annotated, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..models.team import Team
from ..models.hall_of_fame import HallOfFame
from ..models.race import Result, Heat, Race, CANONICAL_DISTANCES
from ..services.time_utils import seconds_to_display, format_pace

# Public, no-auth router for shareable team profiles (FR-K).
router = APIRouter(prefix="/public", tags=["public"])


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


@router.get("/teams/{team_id}", response_model=PublicTeamProfile)
def public_team_profile(team_id: int, db: Annotated[Session, Depends(get_db)]):
    team = db.get(Team, team_id)
    if team is None or not team.is_public:
        raise HTTPException(status_code=404, detail="Team profile not found")

    # Hall of Fame — top entries per distance × gender for this team.
    hof: List[PublicHoFDistance] = []
    for dist in CANONICAL_DISTANCES:
        entries = (
            db.query(HallOfFame)
            .filter(HallOfFame.team_id == team_id, HallOfFame.distance_m == dist)
            .all()
        )

        def to_entry(e: HallOfFame) -> PublicHoFEntry:
            return PublicHoFEntry(
                rank=e.rank,
                athlete_name=e.athlete_name,
                time_display=seconds_to_display(e.time_seconds),
                pace_display=format_pace(e.time_seconds, dist),
                achieved_date=e.achieved_date,
            )

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
