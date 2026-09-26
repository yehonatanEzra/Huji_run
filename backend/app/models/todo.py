from __future__ import annotations
from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, Boolean, ForeignKey, DateTime, func
from sqlalchemy.orm import Mapped, mapped_column
from sqlalchemy.sql.expression import false
from ..database import Base


class Todo(Base):
    """A private personal to-do item. Owned by one user (coach or athlete),
    visible only to that user. Deliberately outside the AI assistant's reach —
    these are personal notes, never fed to tools or the notebook."""
    __tablename__ = "todos"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    # Personal to the owner and carried across teams; team_id is bookkeeping only,
    # never a query filter (a user's private notes don't switch with the team).
    team_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    text: Mapped[str] = mapped_column(String(300), nullable=False)
    note: Mapped[Optional[str]] = mapped_column(String(2000), nullable=True)
    done: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
