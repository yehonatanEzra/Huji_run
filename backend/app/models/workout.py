from __future__ import annotations
from datetime import date, datetime
from sqlalchemy import Integer, String, Text, Boolean, Date, DateTime, ForeignKey, func, UniqueConstraint
from typing import Optional
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base


class GroupWorkout(Base):
    __tablename__ = "group_workouts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    date: Mapped[date] = mapped_column(Date, unique=True, nullable=False, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )


class IndividualTarget(Base):
    __tablename__ = "individual_targets"
    __table_args__ = (UniqueConstraint("athlete_id", "date", name="uq_target_athlete_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    athlete_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    athlete = relationship("User", foreign_keys=[athlete_id], back_populates="individual_targets")


class WorkoutLog(Base):
    __tablename__ = "workout_logs"
    __table_args__ = (UniqueConstraint("athlete_id", "date", name="uq_log_athlete_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    athlete_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    completed: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    logged_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    athlete = relationship("User", back_populates="workout_logs")
