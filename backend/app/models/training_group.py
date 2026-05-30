from __future__ import annotations
from datetime import datetime
from sqlalchemy import Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base


class TrainingGroup(Base):
    __tablename__ = "training_groups"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    # The coach who owns this group. Coach-scoped endpoints filter by this.
    # Nullable for migration safety; backfilled to the bootstrap admin on startup.
    coach_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    members = relationship("User", back_populates="training_group", foreign_keys="User.training_group_id")
    workouts = relationship("GroupWorkout", back_populates="training_group", cascade="all, delete-orphan")
