from __future__ import annotations
from datetime import date, datetime
from sqlalchemy import Integer, String, Text, Date, DateTime, ForeignKey, Enum, func, UniqueConstraint, CheckConstraint
from typing import Optional
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base

CANONICAL_DISTANCES = [1500, 3000, 5000, 10000, 21100, 42200]


class Race(Base):
    __tablename__ = "races"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(200), nullable=False, index=True)
    race_date: Mapped[date] = mapped_column(Date, nullable=False, index=True)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    heats = relationship("Heat", back_populates="race", cascade="all, delete-orphan")
    hall_of_fame_entries = relationship("HallOfFame", back_populates="race")


class Heat(Base):
    __tablename__ = "heats"
    __table_args__ = (
        UniqueConstraint("race_id", "distance_m", "label", name="uq_heat_race_dist_label"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    race_id: Mapped[int] = mapped_column(Integer, ForeignKey("races.id", ondelete="CASCADE"), nullable=False, index=True)
    distance_m: Mapped[int] = mapped_column(Integer, nullable=False)
    label: Mapped[str] = mapped_column(String(100), nullable=False)

    race = relationship("Race", back_populates="heats")
    results = relationship("Result", back_populates="heat", cascade="all, delete-orphan")
    hall_of_fame_entries = relationship("HallOfFame", back_populates="heat")


class Result(Base):
    __tablename__ = "results"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    heat_id: Mapped[int] = mapped_column(Integer, ForeignKey("heats.id", ondelete="CASCADE"), nullable=False, index=True)
    athlete_name: Mapped[str] = mapped_column(String(150), nullable=False)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    gender: Mapped[str] = mapped_column(Enum("M", "F", name="result_gender_enum"), nullable=False)
    time_seconds: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    heat = relationship("Heat", back_populates="results")
    user = relationship("User", back_populates="results")
