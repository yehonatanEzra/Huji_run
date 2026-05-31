from __future__ import annotations
from datetime import date
from typing import Optional
from pydantic import BaseModel


class PBEntry(BaseModel):
    distance_m: int
    time_seconds: int
    time_display: str
    pace_display: str
    achieved_date: date
    race_name: str


class RaceHistoryEntry(BaseModel):
    race_id: int
    race_name: str
    race_date: date
    distance_m: int
    heat_label: str
    time_seconds: int
    time_display: str
    pace_display: str
    placement: int


class ProfileResponse(BaseModel):
    user_id: int
    full_name: str
    gender: str
    photo_url: Optional[str] = None
    bio: Optional[str] = None
    personal_bests: list[PBEntry]
    race_history: list[RaceHistoryEntry]


class HallOfFameEntry(BaseModel):
    rank: int
    athlete_name: str
    time_seconds: int
    time_display: str
    pace_display: str
    achieved_date: date
    race_id: int


class HallOfFameDistance(BaseModel):
    distance_m: int
    men: list[HallOfFameEntry]
    women: list[HallOfFameEntry]


class HallOfFameResponse(BaseModel):
    distances: list[HallOfFameDistance]
