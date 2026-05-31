from __future__ import annotations
from datetime import date
from typing import Literal, Optional
from pydantic import BaseModel, field_validator
from ..models.race import CANONICAL_DISTANCES


class RaceCreate(BaseModel):
    name: str
    race_date: date


class RaceOut(BaseModel):
    id: int
    name: str
    race_date: date
    status: str = "upcoming"  # "upcoming" or "completed"
    registration_count: int = 0
    heat_count: int = 0
    # Moderation state. "approved" is the live, public default; coach-proposed
    # races sit as "pending" until an admin approves; "rejected" carries
    # decline_note set by admin.
    moderation_status: str = "approved"
    decline_note: Optional[str] = None
    model_config = {"from_attributes": True}


class HeatCreate(BaseModel):
    distance_m: int
    label: str

    @field_validator("distance_m")
    @classmethod
    def must_be_canonical(cls, v: int) -> int:
        if v not in CANONICAL_DISTANCES:
            raise ValueError(f"distance_m must be one of {CANONICAL_DISTANCES}")
        return v


class HeatOut(BaseModel):
    id: int
    race_id: int
    distance_m: int
    label: str
    model_config = {"from_attributes": True}


class ResultCreate(BaseModel):
    athlete_name: str
    time_raw: str
    gender: Optional[Literal["M", "F"]] = None  # auto-filled if name matches a user


class ResultOut(BaseModel):
    id: int
    heat_id: int
    athlete_name: str
    gender: str
    time_seconds: int
    time_display: str
    pace_display: str
    placement: Optional[int] = None
    moderation_status: str = "approved"
    decline_note: Optional[str] = None
    created_by: Optional[int] = None
    model_config = {"from_attributes": True}


class HeatWithResults(BaseModel):
    heat: HeatOut
    results: list[ResultOut]


class RaceDetail(BaseModel):
    id: int
    name: str
    race_date: date
    heats: list[HeatOut]
    status: str = "upcoming"
    moderation_status: str = "approved"
    decline_note: Optional[str] = None
    created_by: Optional[int] = None
    model_config = {"from_attributes": True}


class RegistrationCreate(BaseModel):
    user_id: Optional[int] = None  # if None, defaults to current user
    heat_id: Optional[int] = None


class RegistrationUpdate(BaseModel):
    heat_id: Optional[int] = None


class RegistrationOut(BaseModel):
    id: int
    user_id: int
    athlete_name: str
    heat_id: Optional[int] = None
    heat_label: Optional[str] = None
    heat_distance_m: Optional[int] = None
    registered_at: str
    model_config = {"from_attributes": True}
