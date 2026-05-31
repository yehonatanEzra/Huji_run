from __future__ import annotations
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import require_admin
from ..models.user import User
from ..models.race import Race, Heat, Result
from ..services.hall_of_fame import refresh_hall_of_fame

router = APIRouter(prefix="/admin", tags=["admin-review"])


# ── Schemas ───────────────────────────────────────────────────────────────────


class PendingRaceItem(BaseModel):
    id: int
    name: str
    race_date: str
    created_by: int
    proposer_name: str
    created_at: datetime


class PendingResultItem(BaseModel):
    id: int
    heat_id: int
    race_id: int
    race_name: str
    distance_m: int
    heat_label: str
    athlete_name: str
    gender: str
    time_seconds: int
    time_display: str
    created_by: Optional[int]
    proposer_name: Optional[str]
    created_at: datetime


class PendingResponse(BaseModel):
    races: List[PendingRaceItem]
    results: List[PendingResultItem]


class RejectBody(BaseModel):
    note: Optional[str] = None


# ── Endpoints ─────────────────────────────────────────────────────────────────


@router.get("/pending", response_model=PendingResponse)
def list_pending(
    db: Session = Depends(get_db),
    _: User = Depends(require_admin),
):
    pending_races = (
        db.query(Race)
        .filter(Race.status == "pending")
        .order_by(Race.created_at.asc())
        .all()
    )
    pending_results = (
        db.query(Result, Heat, Race)
        .join(Heat, Result.heat_id == Heat.id)
        .join(Race, Heat.race_id == Race.id)
        .filter(Result.status == "pending")
        .order_by(Result.created_at.asc())
        .all()
    )
    user_ids = (
        {r.created_by for r in pending_races}
        | {r.created_by for r, _h, _ra in pending_results if r.created_by is not None}
    )
    users = {u.id: u for u in db.query(User).filter(User.id.in_(user_ids)).all()} if user_ids else {}

    from ..services.time_utils import seconds_to_display
    return PendingResponse(
        races=[
            PendingRaceItem(
                id=r.id,
                name=r.name,
                race_date=r.race_date.isoformat(),
                created_by=r.created_by,
                proposer_name=users[r.created_by].full_name if r.created_by in users else "(unknown)",
                created_at=r.created_at,
            )
            for r in pending_races
        ],
        results=[
            PendingResultItem(
                id=res.id,
                heat_id=res.heat_id,
                race_id=race.id,
                race_name=race.name,
                distance_m=heat.distance_m,
                heat_label=heat.label,
                athlete_name=res.athlete_name,
                gender=res.gender,
                time_seconds=res.time_seconds,
                time_display=seconds_to_display(res.time_seconds),
                created_by=res.created_by,
                proposer_name=users[res.created_by].full_name if res.created_by in users else None,
                created_at=res.created_at,
            )
            for res, heat, race in pending_results
        ],
    )


# ── Race approval ─────────────────────────────────────────────────────────────


@router.post("/pending/races/{race_id}/approve")
def approve_race(
    race_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    race = db.get(Race, race_id)
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")
    if race.status != "pending":
        raise HTTPException(status_code=400, detail=f"Race is {race.status}, not pending")
    race.status = "approved"
    race.decided_at = datetime.utcnow()
    race.decided_by = admin.id
    db.commit()
    return {"ok": True}


@router.post("/pending/races/{race_id}/reject")
def reject_race(
    race_id: int,
    body: RejectBody,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    race = db.get(Race, race_id)
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")
    if race.status != "pending":
        raise HTTPException(status_code=400, detail=f"Race is {race.status}, not pending")
    race.status = "rejected"
    race.decline_note = (body.note or "").strip() or None
    race.decided_at = datetime.utcnow()
    race.decided_by = admin.id
    db.commit()
    return {"ok": True}


# ── Result approval ───────────────────────────────────────────────────────────


@router.post("/pending/results/{result_id}/approve")
def approve_result(
    result_id: int,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    result = db.get(Result, result_id)
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")
    if result.status != "pending":
        raise HTTPException(status_code=400, detail=f"Result is {result.status}, not pending")
    heat = db.get(Heat, result.heat_id)
    result.status = "approved"
    result.decided_at = datetime.utcnow()
    result.decided_by = admin.id
    db.flush()
    if heat:
        refresh_hall_of_fame(db, heat.distance_m, result.gender)
    db.commit()
    return {"ok": True}


@router.post("/pending/results/{result_id}/reject")
def reject_result(
    result_id: int,
    body: RejectBody,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    result = db.get(Result, result_id)
    if not result:
        raise HTTPException(status_code=404, detail="Result not found")
    if result.status != "pending":
        raise HTTPException(status_code=400, detail=f"Result is {result.status}, not pending")
    result.status = "rejected"
    result.decline_note = (body.note or "").strip() or None
    result.decided_at = datetime.utcnow()
    result.decided_by = admin.id
    db.commit()
    return {"ok": True}
