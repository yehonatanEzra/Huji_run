from __future__ import annotations
from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, Boolean, DateTime, ForeignKey, func
from sqlalchemy.sql.expression import false
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base


class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    recipient_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    type: Mapped[str] = mapped_column(String(40), nullable=False)
    message: Mapped[str] = mapped_column(String(255), nullable=False)
    link: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    read: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False, server_default=false())
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), index=True)
