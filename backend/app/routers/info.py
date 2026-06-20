from __future__ import annotations
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user, require_admin
from ..models.user import User
from ..models.info_section import InfoSection

router = APIRouter(prefix="/info", tags=["info"])


class InfoSectionOut(BaseModel):
    id: int
    position: int
    title: str
    summary: Optional[str] = None
    body: str


class InfoSectionUpsert(BaseModel):
    title: str
    summary: Optional[str] = None
    body: str = ""


def _serialize(s: InfoSection) -> InfoSectionOut:
    return InfoSectionOut(id=s.id, position=s.position, title=s.title, summary=s.summary, body=s.body)


@router.get("/sections", response_model=List[InfoSectionOut])
def list_sections(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    rows = db.query(InfoSection).order_by(InfoSection.position, InfoSection.id).all()
    return [_serialize(s) for s in rows]


@router.post("/sections", response_model=InfoSectionOut, status_code=201)
def create_section(
    body: InfoSectionUpsert,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not body.title.strip():
        raise HTTPException(status_code=422, detail="Title is required")
    max_pos = db.query(InfoSection).order_by(InfoSection.position.desc()).first()
    s = InfoSection(
        position=(max_pos.position + 1) if max_pos else 0,
        title=body.title.strip(),
        summary=(body.summary or "").strip() or None,
        body=body.body or "",
    )
    db.add(s)
    db.commit()
    db.refresh(s)
    return _serialize(s)


@router.put("/sections/{section_id}", response_model=InfoSectionOut)
def update_section(
    section_id: int,
    body: InfoSectionUpsert,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    s = db.get(InfoSection, section_id)
    if not s:
        raise HTTPException(status_code=404, detail="Section not found")
    if not body.title.strip():
        raise HTTPException(status_code=422, detail="Title is required")
    s.title = body.title.strip()
    s.summary = (body.summary or "").strip() or None
    s.body = body.body or ""
    db.commit()
    db.refresh(s)
    return _serialize(s)


@router.delete("/sections/{section_id}", status_code=204)
def delete_section(
    section_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    s = db.get(InfoSection, section_id)
    if not s:
        raise HTTPException(status_code=404, detail="Section not found")
    db.delete(s)
    db.commit()


@router.post("/sections/{section_id}/move", response_model=List[InfoSectionOut])
def move_section(
    section_id: int,
    direction: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Swap a section with its neighbour. `direction` is 'up' or 'down'."""
    if direction not in ("up", "down"):
        raise HTTPException(status_code=422, detail="direction must be 'up' or 'down'")
    rows = db.query(InfoSection).order_by(InfoSection.position, InfoSection.id).all()
    idx = next((i for i, s in enumerate(rows) if s.id == section_id), None)
    if idx is None:
        raise HTTPException(status_code=404, detail="Section not found")
    swap = idx - 1 if direction == "up" else idx + 1
    if 0 <= swap < len(rows):
        # Normalise positions to the current order, then swap the two.
        for i, s in enumerate(rows):
            s.position = i
        rows[idx].position, rows[swap].position = rows[swap].position, rows[idx].position
        db.commit()
    rows = db.query(InfoSection).order_by(InfoSection.position, InfoSection.id).all()
    return [_serialize(s) for s in rows]
