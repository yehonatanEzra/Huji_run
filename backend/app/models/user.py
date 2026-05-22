from __future__ import annotations
from datetime import datetime
from sqlalchemy import Integer, String, Enum, DateTime, func
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
        Enum("athlete", "coach", name="role_enum"), nullable=False, default="athlete"
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    workout_logs = relationship("WorkoutLog", back_populates="athlete", cascade="all, delete-orphan")
    individual_targets = relationship("IndividualTarget", foreign_keys="IndividualTarget.athlete_id", back_populates="athlete")
    results = relationship("Result", back_populates="user")
