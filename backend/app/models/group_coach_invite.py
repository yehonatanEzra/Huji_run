from __future__ import annotations
from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base


class GroupCoachInvite(Base):
    """A main coach's pending invitation for another coach to co-coach a group.

    Lifecycle:
      pending → accepted  (invited coach accepts; a GroupCoach row is created)
      pending → declined  (invited coach declines)
      pending → withdrawn (main coach cancels the invite)

    The app enforces "one pending invite per (group, invited_user)" at write time.
    """
    __tablename__ = "group_coach_invites"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    group_id: Mapped[int] = mapped_column(Integer, ForeignKey("training_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    invited_user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    invited_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="assistant")
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
