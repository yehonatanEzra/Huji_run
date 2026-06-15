from __future__ import annotations
from datetime import datetime
from sqlalchemy import Integer, String, Text, Float, DateTime, ForeignKey, func, UniqueConstraint
from typing import Optional
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base


class WorkoutTemplate(Base):
    """A reusable multi-week training plan a coach can apply to a group."""
    __tablename__ = "workout_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    team_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    weeks_count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    days = relationship("WorkoutTemplateDay", back_populates="template",
                        cascade="all, delete-orphan")


class WorkoutTemplateDay(Base):
    """One day's prescription within a template, addressed by (week, weekday)."""
    __tablename__ = "workout_template_days"
    __table_args__ = (
        UniqueConstraint("template_id", "week_number", "day_of_week",
                         name="uq_template_week_day"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    template_id: Mapped[int] = mapped_column(Integer, ForeignKey("workout_templates.id", ondelete="CASCADE"), nullable=False, index=True)
    week_number: Mapped[int] = mapped_column(Integer, nullable=False)   # 1..weeks_count
    day_of_week: Mapped[int] = mapped_column(Integer, nullable=False)   # 0=Mon .. 6=Sun
    workout_type: Mapped[str] = mapped_column(String(20), nullable=False, default="simple")
    title: Mapped[Optional[str]] = mapped_column(String(200), nullable=True)
    content: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    warmup: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    main_session: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    cooldown: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    distance_km: Mapped[Optional[float]] = mapped_column(Float, nullable=True)  # planned distance

    template = relationship("WorkoutTemplate", back_populates="days")
