from __future__ import annotations
from datetime import date, datetime
from sqlalchemy import Integer, String, Text, Boolean, Date, DateTime, Float, ForeignKey, func, UniqueConstraint
from typing import Optional
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base


class GroupWorkoutRecipient(Base):
    """Per-athlete delivery for a group workout. Empty list = broadcast to all group members."""
    __tablename__ = "group_workout_recipients"
    __table_args__ = (UniqueConstraint("group_workout_id", "athlete_id", name="uq_gwr_workout_athlete"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_workout_id: Mapped[int] = mapped_column(Integer, ForeignKey("group_workouts.id", ondelete="CASCADE"), nullable=False, index=True)
    athlete_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)


class GroupWorkout(Base):
    __tablename__ = "group_workouts"
    # No unique constraint on (training_group_id, date): multiple workouts may
    # exist per (group, date), each with its own recipient subset. The
    # athlete-side picker resolves overlaps by newest-id-wins.

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
    note: Mapped[str] = mapped_column(Text, nullable=False)  # kept for backward compat; used for simple/easy
    override_group: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)
    # workout_type: simple | easy | tempo | long | intervals | fartlek
    workout_type: Mapped[str] = mapped_column(String(20), nullable=False, default="simple")
    title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    warmup: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    main_session: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cooldown: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
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


class WorkoutLogComment(Base):
    """Private comment thread on an athlete's workout log. Visible only to the
    athlete who owns the log and any coach."""
    __tablename__ = "workout_log_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    workout_log_id: Mapped[int] = mapped_column(Integer, ForeignKey("workout_logs.id", ondelete="CASCADE"), nullable=False, index=True)
    author_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
