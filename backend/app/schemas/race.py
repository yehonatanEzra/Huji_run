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
    placement: int
    model_config = {"from_attributes": True}


class HeatWithResults(BaseModel):
    heat: HeatOut
    results: list[ResultOut]


class RaceDetail(BaseModel):
    id: int
    name: str
    race_date: date
    heats: list[HeatOut]
    model_config = {"from_attributes": True}
