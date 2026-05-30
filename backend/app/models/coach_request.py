from __future__ import annotations
from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base


class CoachRequest(Base):
    """An athlete's pending/decided request to register with a coach.

    Lifecycle:
      pending → accepted  (coach approves; athlete.coach_id is set)
      pending → declined  (coach rejects; athlete may request again)
      pending → withdrawn (athlete cancels their own request)

    The app enforces "one pending request per athlete" at write time.
    """
    __tablename__ = "coach_requests"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    athlete_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    coach_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
