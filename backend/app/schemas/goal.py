from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel


class GoalCreate(BaseModel):
    athlete_id: int
    goal_type: str  # volume | pb | race
    race_id: Optional[int] = None          # race only
    distance_m: Optional[int] = None       # pb / race
    target_km: Optional[float] = None      # volume only
    target_seconds: Optional[int] = None   # pb / race
    note: Optional[str] = None


class GoalOut(BaseModel):
    id: int
    athlete_id: int
    goal_type: str
    race_id: Optional[int] = None
    distance_m: Optional[int] = None
    target_km: Optional[float] = None
    target_seconds: Optional[int] = None
    note: Optional[str] = None
    status: str
    created_at: datetime
    # Race-goal display (joined)
    race_name: Optional[str] = None
    race_date: Optional[str] = None
    # Computed progress
    current_value: Optional[float] = None   # km (volume) or best seconds (pb); None if no data yet
    progress_pct: float = 0.0               # 0..100
    achieved: bool = False
    target_display: Optional[str] = None     # e.g. "40 km/wk" or "18:00"
    current_display: Optional[str] = None    # e.g. "26.4 km" or "18:42" / "—"

    model_config = {"from_attributes": True}
