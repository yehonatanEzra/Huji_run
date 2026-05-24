from __future__ import annotations
from datetime import datetime
from sqlalchemy import Integer, String, ForeignKey, DateTime, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base


class Kudos(Base):
    __tablename__ = "kudos"
    __table_args__ = (UniqueConstraint("giver_id", "workout_log_id", "emoji", name="uq_kudos_giver_log_emoji"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    giver_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    workout_log_id: Mapped[int] = mapped_column(Integer, ForeignKey("workout_logs.id", ondelete="CASCADE"), nullable=False, index=True)
    emoji: Mapped[str] = mapped_column(String(20), nullable=False, default="clap")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    giver = relationship("User", foreign_keys=[giver_id])
    workout_log = relationship("WorkoutLog")
