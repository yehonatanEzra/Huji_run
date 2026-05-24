from __future__ import annotations
from datetime import date, datetime
from sqlalchemy import Integer, String, Text, Boolean, Date, DateTime, Float, ForeignKey, func, UniqueConstraint
from typing import Optional
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base


class GroupWorkout(Base):
    __tablename__ = "group_workouts"
    __table_args__ = (UniqueConstraint("training_group_id", "date", name="uq_group_workout_group_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    training_group_id: Mapped[int] = mapped_column(Integer, ForeignKey("training_groups.id"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    # workout_type: simple | easy | tempo | long | intervals | fartlek
    workout_type: Mapped[str] = mapped_column(String(20), nullable=False, default="simple")
    title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # for simple/easy/tempo
    warmup: Mapped[Optional[str]] = mapped_column(Text, nullable=True)  # for long/intervals/fartlek
    main_session: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cooldown: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    draft_content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    training_group = relationship("TrainingGroup", back_populates="workouts")


class IndividualTarget(Base):
    __tablename__ = "individual_targets"
    __table_args__ = (UniqueConstraint("athlete_id", "date", name="uq_target_athlete_date"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    athlete_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    note: Mapped[str] = mapped_column(Text, nullable=False)
    override_group: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
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
    status: Mapped[str] = mapped_column(String(10), nullable=False, default="missed")
    distance_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    logged_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    athlete = relationship("User", back_populates="workout_logs")
