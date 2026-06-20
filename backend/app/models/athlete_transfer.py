from __future__ import annotations
from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, DateTime, Boolean, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql.expression import false
from ..database import Base


class AthleteTransfer(Base):
    """A coach's request to hand an athlete to a co-coach of the same group.

    Initiated by the athlete's current personal coach. Completes only once BOTH
    the destination coach AND the athlete approve. On completion the athlete's
    coach_id flips to the destination coach and the old coach's future personal
    targets are wiped; the group (and its group workouts) are left untouched.

    Lifecycle:
      pending → completed  (both parties approved)
      pending → declined   (destination coach or athlete declined)
      pending → cancelled  (initiating coach cancelled)

    The app enforces "one pending transfer per athlete" at write time.
    """
    __tablename__ = "athlete_transfers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    athlete_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    group_id: Mapped[int] = mapped_column(Integer, ForeignKey("training_groups.id", ondelete="CASCADE"), nullable=False, index=True)
    from_coach_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    to_coach_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    to_coach_approved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    athlete_approved: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    status: Mapped[str] = mapped_column(String(20), nullable=False, default="pending")
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    decided_at: Mapped[Optional[datetime]] = mapped_column(DateTime, nullable=True)
