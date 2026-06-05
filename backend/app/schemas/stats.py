from datetime import date
from typing import List, Optional
from pydantic import BaseModel


class KmBucket(BaseModel):
    start: date
    label: str
    km: float


class KmSeriesResponse(BaseModel):
    period: str  # "week" | "month"
    buckets: List[KmBucket]


class PacePoint(BaseModel):
    race_date: date
    race_name: str
    time_seconds: int
    pace_seconds_per_km: float
    is_pb: bool


class PaceDistanceSeries(BaseModel):
    distance_m: int
    label: str
    points: List[PacePoint]


class PaceTrendsResponse(BaseModel):
    distances: List[PaceDistanceSeries]


class WeeklyActivityBucket(BaseModel):
    start: date
    label: str
    running_days: int   # WorkoutLog rows with distance_km > 0.1
    completed: int      # status == "completed"
    partial: int        # status == "partial"
    missed: int         # status == "missed"
    prescribed_days: int  # distinct days with a coach-assigned plan (group or personal)


class WeeklyActivityResponse(BaseModel):
    buckets: List[WeeklyActivityBucket]
