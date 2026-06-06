from __future__ import annotations
from sqlalchemy import Integer, String, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base


class GroupCoach(Base):
    __tablename__ = "group_coaches"
    __table_args__ = (UniqueConstraint("user_id", "group_id", name="uq_group_coach"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    group_id: Mapped[int] = mapped_column(Integer, ForeignKey("training_groups.id"), nullable=False, index=True)
    # "main" = group creator, full access; "assistant" = limited (view + notes on own athletes)
    role: Mapped[str] = mapped_column(String(20), nullable=False, default="main")
