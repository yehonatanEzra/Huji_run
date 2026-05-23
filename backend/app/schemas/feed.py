from __future__ import annotations
from datetime import datetime
from typing import Optional, List
from pydantic import BaseModel


class AnnouncementCreate(BaseModel):
    title: str
    body: str
    training_group_id: Optional[int] = None


class ReactionSummary(BaseModel):
    emoji: str
    count: int
    reacted: bool


class AnnouncementOut(BaseModel):
    id: int
    title: str
    body: str
    author_name: str
    training_group_id: Optional[int] = None
    created_at: datetime
    reactions: List[ReactionSummary] = []

    model_config = {"from_attributes": True}


class ReactionToggle(BaseModel):
    emoji: str
