from __future__ import annotations
from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, Enum, DateTime, ForeignKey, Text, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    full_name: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    username: Mapped[str] = mapped_column(String(80), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    gender: Mapped[str] = mapped_column(Enum("M", "F", name="gender_enum"), nullable=False)
    role: Mapped[str] = mapped_column(
        Enum("athlete", "coach", "admin", name="role_enum"), nullable=False, default="athlete"
    )
    training_group_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("training_groups.id"), nullable=True)
    # Athletes only: which coach this athlete is registered with. Cleared on
    # leave-coach. Coaches/admins leave this null.
    coach_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    photo_filename: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    bio: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    training_group = relationship("TrainingGroup", back_populates="members", foreign_keys=[training_group_id])
    workout_logs = relationship("WorkoutLog", back_populates="athlete", cascade="all, delete-orphan")
    individual_targets = relationship("IndividualTarget", foreign_keys="IndividualTarget.athlete_id", back_populates="athlete")
    results = relationship("Result", back_populates="user", foreign_keys="Result.user_id")
