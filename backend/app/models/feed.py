from __future__ import annotations
from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, Text, ForeignKey, DateTime, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base


class Announcement(Base):
    __tablename__ = "announcements"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    team_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("teams.id", ondelete="SET NULL"), nullable=True, index=True)
    title: Mapped[str] = mapped_column(String(200), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    author_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    training_group_id: Mapped[int] = mapped_column(Integer, ForeignKey("training_groups.id"), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    author = relationship("User", foreign_keys=[author_id])
    reactions = relationship("AnnouncementReaction", back_populates="announcement", cascade="all, delete-orphan")
    comments = relationship("AnnouncementComment", back_populates="announcement", cascade="all, delete-orphan")


class AnnouncementReaction(Base):
    __tablename__ = "announcement_reactions"
    __table_args__ = (UniqueConstraint("announcement_id", "user_id", "emoji", name="uq_reaction_user_emoji"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    announcement_id: Mapped[int] = mapped_column(Integer, ForeignKey("announcements.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    emoji: Mapped[str] = mapped_column(String(10), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    announcement = relationship("Announcement", back_populates="reactions")


class AnnouncementComment(Base):
    __tablename__ = "announcement_comments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    announcement_id: Mapped[int] = mapped_column(Integer, ForeignKey("announcements.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    body: Mapped[str] = mapped_column(Text, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    announcement = relationship("Announcement", back_populates="comments")
    user = relationship("User", foreign_keys=[user_id])
