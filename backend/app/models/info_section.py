from __future__ import annotations
from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, func
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base


class InfoSection(Base):
    """One card on the Info page. Admin-editable so the app's rulebook can be
    maintained without code changes. `body` is free text with light formatting:
    lines starting with "- " render as bullets, **bold** is honored, and a line
    wrapped entirely in **…** renders as a sub-heading.

    Cards nest one level deep: a top-level card (`parent_id` is null) may own
    subcards (`parent_id` set). `position` orders siblings within the same parent."""
    __tablename__ = "info_sections"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    parent_id: Mapped[Optional[int]] = mapped_column(
        Integer, ForeignKey("info_sections.id", ondelete="CASCADE"), nullable=True, index=True
    )
    position: Mapped[int] = mapped_column(Integer, nullable=False, default=0, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    summary: Mapped[Optional[str]] = mapped_column(String(300), nullable=True)
    body: Mapped[str] = mapped_column(Text, nullable=False, default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now())
