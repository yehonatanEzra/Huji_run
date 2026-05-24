from __future__ import annotations
from datetime import date
from typing import Optional, List
from pydantic import BaseModel


class ChallengeCreate(BaseModel):
    name: str
    description: Optional[str] = None
    challenge_type: str
    target_distance_m: Optional[int] = None
    target_km: Optional[float] = None
    start_date: date
    end_date: date
    training_group_id: Optional[int] = None


class ChallengeOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    challenge_type: str
    target_distance_m: Optional[int] = None
    target_km: Optional[float] = None
    start_date: date
    end_date: date
    training_group_id: Optional[int] = None
    days_remaining: int
    is_active: bool

    model_config = {"from_attributes": True}


class LeaderboardEntry(BaseModel):
    rank: int
    athlete_name: str
    value: float
    value_display: str


class ChallengeDetail(ChallengeOut):
    leaderboard: List[LeaderboardEntry] = []
    my_rank: Optional[int] = None
    my_value: Optional[float] = None
