"""Admin-only management of the AI prompt store. Lets an admin view and edit
every prompt the AI coach uses (system prompt, tool descriptions, summarizer,
notebook-rewrite) without a code deploy. Mounted at /admin/prompts.

Editing writes to the system_prompts table; the AI reads from there at runtime
and falls back to the hardcoded default only when a row is missing."""
from __future__ import annotations
from datetime import datetime
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import require_admin
from ..models.user import User
from ..models.assistant import SystemPrompt
from ..services.assistant_prompts import DEFAULT_PROMPTS

router = APIRouter(prefix="/admin/prompts", tags=["admin-prompts"])


class PromptOut(BaseModel):
    key: str
    content: str
    updated_at: Optional[datetime] = None
    is_default: bool = False  # True when no DB row exists yet (showing the fallback)


class PromptUpdate(BaseModel):
    content: str = Field(..., min_length=1)


@router.get("", response_model=list[PromptOut])
def list_prompts(
    _admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """All known prompt keys. DB rows win; keys with no row are shown with their
    hardcoded default and is_default=True."""
    rows = {p.key: p for p in db.query(SystemPrompt).all()}
    out: list[PromptOut] = []
    keys = set(DEFAULT_PROMPTS) | set(rows)
    for key in sorted(keys):
        row = rows.get(key)
        if row is not None:
            out.append(PromptOut(key=key, content=row.content, updated_at=row.updated_at, is_default=False))
        else:
            out.append(PromptOut(key=key, content=DEFAULT_PROMPTS.get(key, ""), updated_at=None, is_default=True))
    return out


@router.put("/{key}", response_model=PromptOut)
def update_prompt(
    key: str,
    body: PromptUpdate,
    admin: Annotated[User, Depends(require_admin)],
    db: Annotated[Session, Depends(get_db)],
):
    """Upsert the content for a prompt key. Unknown keys are rejected to avoid
    typos silently creating dead rows."""
    if key not in DEFAULT_PROMPTS:
        raise HTTPException(status_code=404, detail=f"Unknown prompt key: {key}")
    row = db.query(SystemPrompt).filter(SystemPrompt.key == key).first()
    if row is None:
        row = SystemPrompt(key=key, content=body.content, updated_by=admin.id)
        db.add(row)
    else:
        row.content = body.content
        row.updated_by = admin.id
    db.commit()
    db.refresh(row)
    return PromptOut(key=row.key, content=row.content, updated_at=row.updated_at, is_default=False)
