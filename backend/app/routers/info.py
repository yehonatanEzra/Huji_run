from __future__ import annotations
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
    parent_id: Optional[int] = None
    position: int
    title: str
    summary: Optional[str] = None
    body: str
    children: List["InfoSectionOut"] = []


class InfoSectionUpsert(BaseModel):
    title: str
    summary: Optional[str] = None
    body: str = ""
    parent_id: Optional[int] = None  # set to nest under a top-level card


def _serialize(s: InfoSection, children: Optional[List[InfoSection]] = None) -> InfoSectionOut:
    return InfoSectionOut(
        id=s.id, parent_id=s.parent_id, position=s.position,
        title=s.title, summary=s.summary, body=s.body,
        children=[_serialize(c) for c in (children or [])],
    )


def _tree(db: Session) -> List[InfoSectionOut]:
    rows = db.query(InfoSection).order_by(InfoSection.position, InfoSection.id).all()
    kids: dict[int, List[InfoSection]] = {}
    for s in rows:
        if s.parent_id is not None:
            kids.setdefault(s.parent_id, []).append(s)
    return [_serialize(s, kids.get(s.id, [])) for s in rows if s.parent_id is None]


@router.get("/sections", response_model=List[InfoSectionOut])
def list_sections(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    return _tree(db)


@router.post("/sections", response_model=List[InfoSectionOut], status_code=201)
def create_section(
    body: InfoSectionUpsert,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    if not body.title.strip():
        raise HTTPException(status_code=422, detail="Title is required")
    parent_id = body.parent_id
    if parent_id is not None:
        parent = db.get(InfoSection, parent_id)
        if parent is None:
            raise HTTPException(status_code=404, detail="Parent section not found")
        if parent.parent_id is not None:
            raise HTTPException(status_code=422, detail="Subcards can only nest one level deep")
    # Position is scoped to the sibling set (same parent).
    siblings = db.query(InfoSection).filter(InfoSection.parent_id == parent_id)
    max_pos = siblings.order_by(InfoSection.position.desc()).first()
    s = InfoSection(
        parent_id=parent_id,
        position=(max_pos.position + 1) if max_pos else 0,
        title=body.title.strip(),
        summary=(body.summary or "").strip() or None,
        body=body.body or "",
    )
    db.add(s)
    db.commit()
    return _tree(db)


@router.put("/sections/{section_id}", response_model=List[InfoSectionOut])
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
    return _tree(db)


@router.delete("/sections/{section_id}", response_model=List[InfoSectionOut])
def delete_section(
    section_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    s = db.get(InfoSection, section_id)
    if not s:
        raise HTTPException(status_code=404, detail="Section not found")
    # Explicitly remove subcards too — DB cascade may not fire under SQLite here.
    db.query(InfoSection).filter(InfoSection.parent_id == section_id).delete(synchronize_session=False)
    db.delete(s)
    db.commit()
    return _tree(db)


@router.post("/sections/{section_id}/move", response_model=List[InfoSectionOut])
def move_section(
    section_id: int,
    direction: str,
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    """Swap a section with its neighbour within its own sibling set (same parent).
    `direction` is 'up' or 'down'."""
    if direction not in ("up", "down"):
        raise HTTPException(status_code=422, detail="direction must be 'up' or 'down'")
    target = db.get(InfoSection, section_id)
    if target is None:
        raise HTTPException(status_code=404, detail="Section not found")
    siblings = (
        db.query(InfoSection)
        .filter(InfoSection.parent_id == target.parent_id)
        .order_by(InfoSection.position, InfoSection.id)
        .all()
    )
    idx = next((i for i, s in enumerate(siblings) if s.id == section_id), None)
    swap = idx - 1 if direction == "up" else idx + 1
    if 0 <= swap < len(siblings):
        # Normalise positions to the current order, then swap the two.
        for i, s in enumerate(siblings):
            s.position = i
        siblings[idx].position, siblings[swap].position = siblings[swap].position, siblings[idx].position
        db.commit()
    return _tree(db)
