from __future__ import annotations
from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, Text, DateTime, ForeignKey, UniqueConstraint, func
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base


class AssistantConversation(Base):
    """One chat session between an athlete and the AI coach. Messages hang off
    this. `token_count` is a running estimate used to trigger auto-summarization;
    `summary` holds the compacted recap once older turns are folded away."""
    __tablename__ = "assistant_conversations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    athlete_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token_count: Mapped[int] = mapped_column(Integer, nullable=False, default=0, server_default="0")
    summary: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)

    messages = relationship(
        "AssistantMessage", back_populates="conversation",
        cascade="all, delete-orphan", order_by="AssistantMessage.id",
    )


class AssistantMessage(Base):
    """A single turn in a conversation. `role` ∈ user | assistant | tool.
    For tool messages, `tool_name` records which tool produced the content."""
    __tablename__ = "assistant_messages"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    conversation_id: Mapped[int] = mapped_column(Integer, ForeignKey("assistant_conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role: Mapped[str] = mapped_column(String(20), nullable=False)  # user | assistant | tool
    content: Mapped[str] = mapped_column(Text, nullable=False)
    tool_name: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), nullable=False)

    conversation = relationship("AssistantConversation", back_populates="messages")


class AthleteNotebook(Base):
    """The AI coach's persistent notebook for one athlete — a living, curated
    set of notes (injuries, goals, patterns) that survives across conversations.
    One row per athlete. Rewritten by the AI (via button) or edited by the athlete.
    Capped at 1500 chars (enforced in the endpoint)."""
    __tablename__ = "athlete_notebooks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    athlete_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, unique=True, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False, default="", server_default="")
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)


class SystemPrompt(Base):
    """Admin-editable prompt store. Every prompt the AI feature uses (system
    prompt, tool descriptions, summarizer prompt, notebook-rewrite prompt) lives
    here keyed by a stable string, so admins can tune them without a code deploy."""
    __tablename__ = "system_prompts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    key: Mapped[str] = mapped_column(String(80), nullable=False, unique=True, index=True)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now(), onupdate=func.now(), nullable=False)
    updated_by: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
