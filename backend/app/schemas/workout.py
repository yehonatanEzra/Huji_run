from __future__ import annotations
from datetime import date
from typing import Optional
from pydantic import BaseModel


class GroupWorkoutUpsert(BaseModel):
    content: str


class GroupWorkoutOut(BaseModel):
    id: int
    date: date
    content: str
    model_config = {"from_attributes": True}


class IndividualTargetUpsert(BaseModel):
    note: str


class IndividualTargetOut(BaseModel):
    id: int
    athlete_id: int
    date: date
    note: str
    model_config = {"from_attributes": True}


class WorkoutLogUpsert(BaseModel):
    date: date
    completed: bool
    notes: Optional[str] = None


class WorkoutLogOut(BaseModel):
    id: int
    date: date
    completed: bool
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
    days: list[dict]  # [{date, log: WorkoutLogOut|None}]


class CoachDashboardResponse(BaseModel):
    week_start: date
    athletes: list[AthleteWeekRow]
