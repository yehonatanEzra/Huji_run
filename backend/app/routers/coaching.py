from __future__ import annotations
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user, require_coach
from ..models.user import User
from ..models.coach_request import CoachRequest

router = APIRouter(tags=["coaching"])


# ── Schemas ───────────────────────────────────────────────────────────────────


class CoachListItem(BaseModel):
    id: int
    full_name: str
    username: str
    athlete_count: int
    bio: Optional[str] = None


class CoachRequestCreate(BaseModel):
    coach_id: int


class CoachRequestOut(BaseModel):
    id: int
    athlete_id: int
    athlete_name: str
    coach_id: int
    coach_name: str
    status: str
    created_at: datetime
    decided_at: Optional[datetime] = None


class PairingStatusOut(BaseModel):
    coach_id: Optional[int]
    coach_name: Optional[str]
    pending_request: Optional[CoachRequestOut]


# ── Public-ish coach directory ────────────────────────────────────────────────


@router.get("/coaches", response_model=List[CoachListItem])
def list_coaches(
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    """Coach directory for the athlete-side picker. Authenticated users only."""
    coach_rows = (
        db.query(User)
        .filter(User.role.in_(("coach", "admin")))
        .order_by(User.full_name.asc())
        .all()
    )
    if not coach_rows:
        return []
    counts = dict(
        db.query(User.coach_id, sa_func.count(User.id))
        .filter(User.role == "athlete", User.coach_id.in_([c.id for c in coach_rows]))
        .group_by(User.coach_id)
        .all()
    )
    return [
        CoachListItem(
            id=c.id,
            full_name=c.full_name,
            username=c.username,
            athlete_count=int(counts.get(c.id, 0)),
            bio=c.bio,
        )
        for c in coach_rows
    ]


# ── Athlete-side endpoints ────────────────────────────────────────────────────


def _serialize_request(db: Session, req: CoachRequest) -> CoachRequestOut:
    athlete = db.get(User, req.athlete_id)
    coach = db.get(User, req.coach_id)
    return CoachRequestOut(
        id=req.id,
        athlete_id=req.athlete_id,
        athlete_name=athlete.full_name if athlete else "(unknown)",
        coach_id=req.coach_id,
        coach_name=coach.full_name if coach else "(unknown)",
        status=req.status,
        created_at=req.created_at,
        decided_at=req.decided_at,
    )


@router.get("/me/pairing", response_model=PairingStatusOut)
def my_pairing(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """The athlete's current coach + any pending request they have."""
    coach_name = None
    if current_user.coach_id:
        coach = db.get(User, current_user.coach_id)
        coach_name = coach.full_name if coach else None
    pending = (
        db.query(CoachRequest)
        .filter(CoachRequest.athlete_id == current_user.id, CoachRequest.status == "pending")
        .order_by(CoachRequest.id.desc())
        .first()
    )
    return PairingStatusOut(
        coach_id=current_user.coach_id,
        coach_name=coach_name,
        pending_request=_serialize_request(db, pending) if pending else None,
    )


@router.post("/coach-requests", response_model=CoachRequestOut, status_code=201)
def create_request(
    body: CoachRequestCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Athlete sends a join request to a coach."""
    if current_user.role != "athlete":
        raise HTTPException(status_code=403, detail="Only athletes can request a coach")
    if current_user.coach_id is not None:
        raise HTTPException(status_code=400, detail="You already have a coach; leave first")
    existing_pending = (
        db.query(CoachRequest)
        .filter(CoachRequest.athlete_id == current_user.id, CoachRequest.status == "pending")
        .first()
    )
    if existing_pending:
        raise HTTPException(status_code=400, detail="You already have a pending request")
    coach = db.get(User, body.coach_id)
    if not coach or coach.role not in ("coach", "admin"):
        raise HTTPException(status_code=404, detail="Coach not found")
    req = CoachRequest(athlete_id=current_user.id, coach_id=body.coach_id, status="pending")
    db.add(req)
    db.commit()
    db.refresh(req)
    return _serialize_request(db, req)


@router.delete("/coach-requests/{request_id}", status_code=204)
def withdraw_request(
    request_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Athlete withdraws their own pending request."""
    req = db.get(CoachRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.athlete_id != current_user.id:
        raise HTTPException(status_code=403, detail="Not your request")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Request is not pending")
    req.status = "withdrawn"
    req.decided_at = datetime.utcnow()
    db.commit()


@router.post("/me/leave-coach", status_code=204)
def leave_coach(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Athlete drops their current coach. Past data stays intact; only the
    relationship and group membership are cleared."""
    if current_user.role != "athlete":
        raise HTTPException(status_code=403, detail="Only athletes can leave a coach")
    if current_user.coach_id is None:
        return  # already unpaired — idempotent
    current_user.coach_id = None
    current_user.training_group_id = None
    db.commit()


# ── Coach-side endpoints ──────────────────────────────────────────────────────


@router.get("/coach-requests/incoming", response_model=List[CoachRequestOut])
def incoming_requests(
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
):
    """Pending requests addressed to this coach."""
    rows = (
        db.query(CoachRequest)
        .filter(CoachRequest.coach_id == coach.id, CoachRequest.status == "pending")
        .order_by(CoachRequest.created_at.asc())
        .all()
    )
    return [_serialize_request(db, r) for r in rows]


@router.post("/coach-requests/{request_id}/accept", response_model=CoachRequestOut)
def accept_request(
    request_id: int,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
):
    """Coach accepts a pending request → athlete.coach_id = me."""
    req = db.get(CoachRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.coach_id != coach.id:
        raise HTTPException(status_code=403, detail="Not your request")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Request is not pending")
    athlete = db.get(User, req.athlete_id)
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete no longer exists")
    if athlete.coach_id is not None:
        # Athlete already paired (perhaps through another route) — reject this one.
        raise HTTPException(status_code=409, detail="Athlete already has a coach")
    athlete.coach_id = coach.id
    req.status = "accepted"
    req.decided_at = datetime.utcnow()
    # Any *other* pending requests this athlete has out → mark withdrawn.
    db.query(CoachRequest).filter(
        CoachRequest.athlete_id == athlete.id,
        CoachRequest.status == "pending",
        CoachRequest.id != req.id,
    ).update({CoachRequest.status: "withdrawn", CoachRequest.decided_at: datetime.utcnow()},
             synchronize_session=False)
    db.commit()
    db.refresh(req)
    return _serialize_request(db, req)


@router.post("/coach-requests/{request_id}/decline", response_model=CoachRequestOut)
def decline_request(
    request_id: int,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
):
    """Coach declines a pending request. Athlete may request again later."""
    req = db.get(CoachRequest, request_id)
    if not req:
        raise HTTPException(status_code=404, detail="Request not found")
    if req.coach_id != coach.id:
        raise HTTPException(status_code=403, detail="Not your request")
    if req.status != "pending":
        raise HTTPException(status_code=400, detail="Request is not pending")
    req.status = "declined"
    req.decided_at = datetime.utcnow()
    db.commit()
    db.refresh(req)
    return _serialize_request(db, req)


@router.delete("/coach/athletes/{athlete_id}/registration", status_code=204)
def remove_athlete_from_roster(
    athlete_id: int,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
):
    """Coach (or admin) removes an athlete from their roster. Athlete keeps
    all past data; only coach_id and training_group_id are cleared."""
    athlete = db.get(User, athlete_id)
    if not athlete or athlete.role != "athlete":
        raise HTTPException(status_code=404, detail="Athlete not found")
    # Coach can only remove athletes they actually coach. Admin can remove any.
    if coach.role != "admin" and athlete.coach_id != coach.id:
        raise HTTPException(status_code=403, detail="Not your athlete")
    athlete.coach_id = None
    athlete.training_group_id = None
    db.commit()
