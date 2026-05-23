from __future__ import annotations
from datetime import date, datetime
from typing import Optional
from sqlalchemy import Integer, String, Text, Date, DateTime, ForeignKey, Float, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base


class Challenge(Base):
    __tablename__ = "challenges"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    challenge_type: Mapped[str] = mapped_column(String(20), nullable=False)
    target_distance_m: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    target_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    training_group_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("training_groups.id"), nullable=True)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    creator = relationship("User", foreign_keys=[created_by])
