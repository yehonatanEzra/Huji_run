from __future__ import annotations
from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, Float, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base


class Goal(Base):
    """An athlete's target — either a weekly-volume goal (target_km) or a
    personal-best goal (distance_m + target_seconds). Created by the athlete or
    one of their coaches. Progress is computed on read from logs/results."""
    __tablename__ = "goals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    team_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True)
    athlete_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    goal_type: Mapped[str] = mapped_column(String(20), nullable=False)  # volume | pb | race
    race_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("races.id", ondelete="CASCADE"), nullable=True, index=True)  # race only
    distance_m: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)      # pb / race
    target_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)       # volume only
    target_seconds: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)  # pb only
    note: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="active", server_default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    athlete = relationship("User", foreign_keys=[athlete_id])
