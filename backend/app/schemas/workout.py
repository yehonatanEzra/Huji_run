from __future__ import annotations
from datetime import date
from typing import Optional, List
from pydantic import BaseModel


class GroupWorkoutUpsert(BaseModel):
    workout_type: Optional[str] = None  # simple|easy|tempo|long|intervals|fartlek
    title: Optional[str] = None
    content: Optional[str] = None
    warmup: Optional[str] = None
    main_session: Optional[str] = None
    cooldown: Optional[str] = None
    draft_content: Optional[str] = None


class GroupWorkoutOut(BaseModel):
    id: int
    date: date
    workout_type: str = "simple"
    title: Optional[str] = None
    content: Optional[str] = None
    warmup: Optional[str] = None
    main_session: Optional[str] = None
    cooldown: Optional[str] = None
    draft_content: Optional[str] = None
    model_config = {"from_attributes": True}


class IndividualTargetUpsert(BaseModel):
    note: str = ""
    override_group: bool = False
    workout_type: Optional[str] = None
    title: Optional[str] = None
    warmup: Optional[str] = None
    main_session: Optional[str] = None
    cooldown: Optional[str] = None


class IndividualTargetOut(BaseModel):
    id: int
    athlete_id: int
    date: date
    note: str
    override_group: bool
    workout_type: str = "simple"
    title: Optional[str] = None
    warmup: Optional[str] = None
    main_session: Optional[str] = None
    cooldown: Optional[str] = None
    model_config = {"from_attributes": True}


class WorkoutLogUpsert(BaseModel):
    date: date
    status: str = "missed"
    distance_km: Optional[float] = None
    notes: Optional[str] = None


class ReactionItem(BaseModel):
    emoji: str
    count: int
    reacted: bool


class WorkoutLogOut(BaseModel):
    id: int
    date: date
    completed: bool
    status: str
    distance_km: Optional[float] = None
    notes: Optional[str]
    kudos_count: int = 0
    has_kudos: bool = False
    reactions: List[ReactionItem] = []
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
