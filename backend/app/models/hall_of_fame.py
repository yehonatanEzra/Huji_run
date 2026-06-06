from __future__ import annotations
from datetime import date
from sqlalchemy import Integer, String, Date, ForeignKey, Enum, UniqueConstraint
from typing import Optional
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base


class HallOfFame(Base):
    __tablename__ = "hall_of_fame"
    __table_args__ = (
        UniqueConstraint("distance_m", "gender", "rank", name="uq_hof_dist_gender_rank"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    team_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True)
    distance_m: Mapped[int] = mapped_column(Integer, nullable=False, index=True)
    gender: Mapped[str] = mapped_column(Enum("M", "F", name="hof_gender_enum"), nullable=False)
    rank: Mapped[int] = mapped_column(Integer, nullable=False)
    user_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    athlete_name: Mapped[str] = mapped_column(String(150), nullable=False)
    time_seconds: Mapped[int] = mapped_column(Integer, nullable=False)
    race_id: Mapped[int] = mapped_column(Integer, ForeignKey("races.id"), nullable=False)
    heat_id: Mapped[int] = mapped_column(Integer, ForeignKey("heats.id"), nullable=False)
    achieved_date: Mapped[date] = mapped_column(Date, nullable=False)

    race = relationship("Race", back_populates="hall_of_fame_entries")
    heat = relationship("Heat", back_populates="hall_of_fame_entries")
