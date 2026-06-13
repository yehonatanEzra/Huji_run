from __future__ import annotations
from datetime import datetime
from sqlalchemy import Integer, DateTime, ForeignKey, func, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base


class GroupAddRequest(Base):
    """An assistant coach's pending request to add their athlete to a group.

    Created when an assistant coach — who is also the athlete's personal coach —
    adds an athlete to a group they assist; the group's main coach must approve.

    Resolved by delete (no status column): approve sets the athlete's
    training_group_id and deletes the row; reject just deletes it. The unique
    constraint + delete-on-resolve keeps the add endpoint idempotent (a second
    add re-points at the existing pending row instead of stacking duplicates).
    """
    __tablename__ = "group_add_requests"
    __table_args__ = (
        UniqueConstraint("athlete_id", "group_id", name="uq_group_add_request_athlete_group"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    athlete_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    group_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("training_groups.id", ondelete="CASCADE"), nullable=False, index=True
    )
    requested_by_id: Mapped[int] = mapped_column(
        Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
