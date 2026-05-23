from __future__ import annotations
from datetime import date
from typing import Optional
from pydantic import BaseModel


class GroupWorkoutUpsert(BaseModel):
    content: Optional[str] = None
    draft_content: Optional[str] = None


class GroupWorkoutOut(BaseModel):
    id: int
    date: date
    content: Optional[str]
    draft_content: Optional[str]
    model_config = {"from_attributes": True}


class IndividualTargetUpsert(BaseModel):
    note: str
    override_group: bool = False


class IndividualTargetOut(BaseModel):
    id: int
    athlete_id: int
    date: date
    note: str
    override_group: bool
    model_config = {"from_attributes": True}


class WorkoutLogUpsert(BaseModel):
    date: date
    status: str = "missed"
    notes: Optional[str] = None


class WorkoutLogOut(BaseModel):
    id: int
    date: date
    completed: bool
    status: str
    notes: Optional[str]
    model_config = {"from_attributes": True}


class DayData(BaseModel):
    date: date
    group_workout: Optional[GroupWorkoutOut]
    individual_target: Optional[IndividualTargetOut]
    workout_log: Optional[WorkoutLogOut]


class WeekResponse(BaseModel):
    week_start: date
    days: list[DayData]


class AthleteWeekRow(BaseModel):
    id: int
    full_name: str
    gender: str
    group_name: Optional[str] = None
    days: list[dict]  # [{date, log: WorkoutLogOut|None}]


class CoachDashboardResponse(BaseModel):
    week_start: date
    athletes: list[AthleteWeekRow]
