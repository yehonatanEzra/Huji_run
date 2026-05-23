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


class CommentOut(BaseModel):
    id: int
    user_name: str
    user_id: int
    photo_url: Optional[str] = None
    body: str
    created_at: datetime


class AnnouncementOut(BaseModel):
    id: int
    title: str
    body: str
    author_name: str
    author_photo_url: Optional[str] = None
    training_group_id: Optional[int] = None
    created_at: datetime
    reactions: List[ReactionSummary] = []
    comments: List[CommentOut] = []
    comment_count: int = 0

    model_config = {"from_attributes": True}


class ReactionToggle(BaseModel):
    emoji: str


class CommentCreate(BaseModel):
    body: str
