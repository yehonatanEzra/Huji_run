from __future__ import annotations
from datetime import datetime
from typing import Optional
from pydantic import BaseModel, field_validator


class TodoCreate(BaseModel):
    text: str
    note: Optional[str] = None

    @field_validator("text")
    @classmethod
    def _text_not_blank(cls, v: str) -> str:
        v = (v or "").strip()
        if not v:
            raise ValueError("text must not be empty")
        return v[:300]


class TodoUpdate(BaseModel):
    """Partial update — any subset of fields."""
    text: Optional[str] = None
    note: Optional[str] = None
    done: Optional[bool] = None

    @field_validator("text")
    @classmethod
    def _text_not_blank(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        v = v.strip()
        if not v:
            raise ValueError("text must not be empty")
        return v[:300]


class TodoOut(BaseModel):
    id: int
    text: str
    note: Optional[str] = None
    done: bool
    created_at: datetime

    model_config = {"from_attributes": True}
