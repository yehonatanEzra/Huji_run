from __future__ import annotations
from datetime import date
from typing import Optional
from pydantic import BaseModel, field_validator


class TemplateDayIn(BaseModel):
    week_number: int
    day_of_week: int  # 0=Mon .. 6=Sun
    workout_type: str = "simple"
    title: Optional[str] = None
    content: Optional[str] = None
    warmup: Optional[str] = None
    main_session: Optional[str] = None
    cooldown: Optional[str] = None

    @field_validator("day_of_week")
    @classmethod
    def _valid_dow(cls, v: int) -> int:
        if not 0 <= v <= 6:
            raise ValueError("day_of_week must be 0..6")
        return v

    @field_validator("week_number")
    @classmethod
    def _valid_week(cls, v: int) -> int:
        if v < 1:
            raise ValueError("week_number must be >= 1")
        return v


class TemplateDayOut(TemplateDayIn):
    id: int
    model_config = {"from_attributes": True}


class TemplateUpsert(BaseModel):
    name: str
    description: Optional[str] = None
    weeks_count: int = 1
    days: list[TemplateDayIn] = []

    @field_validator("name")
    @classmethod
    def _name_nonempty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("name is required")
        return v.strip()

    @field_validator("weeks_count")
    @classmethod
    def _weeks_bounds(cls, v: int) -> int:
        if not 1 <= v <= 26:
            raise ValueError("weeks_count must be 1..26")
        return v


class TemplateSummary(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    weeks_count: int
    day_count: int
    model_config = {"from_attributes": True}


class TemplateDetail(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    weeks_count: int
    days: list[TemplateDayOut]
    model_config = {"from_attributes": True}


class TemplateApply(BaseModel):
    group_id: int
    start_date: date          # snapped to the Monday of its week on the server
    replace: bool = True      # overwrite existing group workouts on the plan's dates


class TemplateApplyResult(BaseModel):
    created: int
    replaced: int             # existing workouts on the plan's dates that were overwritten
    start_monday: date
    end_date: date
