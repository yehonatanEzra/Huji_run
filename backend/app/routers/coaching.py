from __future__ import annotations
from datetime import date, datetime
from typing import List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func as sa_func, or_
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user, require_coach
from ..models.user import User
from ..models.coach_request import CoachRequest
from ..models.workout import IndividualTarget
from ..models.group_add_request import GroupAddRequest
from ..models.group_coach import GroupCoach
from ..models.athlete_transfer import AthleteTransfer
from ..services.notifications import notify

router = APIRouter(tags=["coaching"])


def _cancel_pending_transfers(db: Session, athlete_id: int) -> None:
    """Mark any pending transfer for this athlete cancelled (relationship ending)."""
    db.query(AthleteTransfer).filter(
        AthleteTransfer.athlete_id == athlete_id,
        AthleteTransfer.status == "pending",
    ).update({AthleteTransfer.status: "cancelled", AthleteTransfer.decided_at: datetime.utcnow()},
             synchronize_session=False)


# ── Schemas ───────────────────────────────────────────────────────────────────


class CoachListItem(BaseModel):
    id: int
    full_name: str
    username: str
    athlete_count: int
    bio: Optional[str] = None
    has_photo: bool = False


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
            has_photo=c.photo_filename is not None,
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
    """Athlete drops their current coach. Past workout logs + targets stay so
    the history is preserved; future individual targets from the old coach are
    wiped so the athlete starts clean (and a future coach has an empty slate)."""
    if current_user.role != "athlete":
        raise HTTPException(status_code=403, detail="Only athletes can leave a coach")
    if current_user.coach_id is None:
        return  # already unpaired — idempotent
    db.query(IndividualTarget).filter(
        IndividualTarget.athlete_id == current_user.id,
        IndividualTarget.date >= date.today(),
    ).delete(synchronize_session=False)
    # The personal-coach relationship is ending → any pending group-add is stale.
    db.query(GroupAddRequest).filter(
        GroupAddRequest.athlete_id == current_user.id
    ).delete(synchronize_session=False)
    _cancel_pending_transfers(db, current_user.id)
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
    all past data; future individual targets are wiped so they don't linger
    after the relationship ends."""
    athlete = db.get(User, athlete_id)
    if not athlete or athlete.role != "athlete":
        raise HTTPException(status_code=404, detail="Athlete not found")
    # Coach can only remove athletes they actually coach. Admin can remove any.
    if coach.role != "admin" and athlete.coach_id != coach.id:
        raise HTTPException(status_code=403, detail="Not your athlete")
    db.query(IndividualTarget).filter(
        IndividualTarget.athlete_id == athlete.id,
        IndividualTarget.date >= date.today(),
    ).delete(synchronize_session=False)
    # Relationship ending → drop any pending group-add for this athlete.
    db.query(GroupAddRequest).filter(
        GroupAddRequest.athlete_id == athlete.id
    ).delete(synchronize_session=False)
    _cancel_pending_transfers(db, athlete.id)
    athlete.coach_id = None
    athlete.training_group_id = None
    db.commit()


# ── Athlete transfer (coach → co-coach, dual approval) ──────────────────────────


class TransferCreate(BaseModel):
    to_coach_id: int


class TransferOut(BaseModel):
    id: int
    athlete_id: int
    athlete_name: str
    group_id: int
    group_name: str
    from_coach_id: int
    from_coach_name: str
    to_coach_id: int
    to_coach_name: str
    to_coach_approved: bool
    athlete_approved: bool
    status: str
    created_at: datetime
    you_approved: bool = False


def _serialize_transfer(db: Session, t: AthleteTransfer, viewer_id: Optional[int] = None) -> TransferOut:
    from ..models.training_group import TrainingGroup
    athlete = db.get(User, t.athlete_id)
    group = db.get(TrainingGroup, t.group_id)
    frm = db.get(User, t.from_coach_id)
    to = db.get(User, t.to_coach_id)
    you_approved = False
    if viewer_id == t.to_coach_id:
        you_approved = t.to_coach_approved
    elif viewer_id == t.athlete_id:
        you_approved = t.athlete_approved
    return TransferOut(
        id=t.id,
        athlete_id=t.athlete_id,
        athlete_name=athlete.full_name if athlete else "(unknown)",
        group_id=t.group_id,
        group_name=group.name if group else "(unknown)",
        from_coach_id=t.from_coach_id,
        from_coach_name=frm.full_name if frm else "(unknown)",
        to_coach_id=t.to_coach_id,
        to_coach_name=to.full_name if to else "(unknown)",
        to_coach_approved=t.to_coach_approved,
        athlete_approved=t.athlete_approved,
        status=t.status,
        created_at=t.created_at,
        you_approved=you_approved,
    )


@router.post("/coach/athletes/{athlete_id}/transfer", response_model=TransferOut, status_code=201)
def create_transfer(
    athlete_id: int,
    body: TransferCreate,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
):
    """The athlete's personal coach proposes handing them to a co-coach of the
    same group. Completes only once the destination coach AND the athlete approve."""
    athlete = db.get(User, athlete_id)
    if not athlete or athlete.role != "athlete":
        raise HTTPException(status_code=404, detail="Athlete not found")
    if coach.role != "admin" and athlete.coach_id != coach.id:
        raise HTTPException(status_code=403, detail="Not your athlete")
    if athlete.coach_id is None:
        raise HTTPException(status_code=400, detail="Athlete has no personal coach to transfer from")
    if athlete.training_group_id is None:
        raise HTTPException(status_code=400, detail="Athlete is not in a group; transfer is within a group")
    if body.to_coach_id == athlete.coach_id:
        raise HTTPException(status_code=400, detail="Athlete already has this coach")

    to_coach = db.get(User, body.to_coach_id)
    if not to_coach or to_coach.role not in ("coach", "admin"):
        raise HTTPException(status_code=404, detail="Destination coach not found")
    is_co_coach = db.query(GroupCoach).filter(
        GroupCoach.group_id == athlete.training_group_id,
        GroupCoach.user_id == body.to_coach_id,
    ).first()
    if is_co_coach is None:
        raise HTTPException(status_code=400, detail="Destination coach must co-coach the athlete's group")

    existing = db.query(AthleteTransfer).filter(
        AthleteTransfer.athlete_id == athlete_id, AthleteTransfer.status == "pending"
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="A transfer is already pending for this athlete")

    t = AthleteTransfer(
        athlete_id=athlete_id, group_id=athlete.training_group_id,
        from_coach_id=athlete.coach_id, to_coach_id=body.to_coach_id, status="pending",
    )
    db.add(t)
    db.flush()
    notify(db, body.to_coach_id, "transfer_request",
           f"{coach.full_name} wants to transfer {athlete.full_name} to you.", "/coach/requests")
    notify(db, athlete_id, "transfer_request",
           f"{coach.full_name} wants to transfer you to {to_coach.full_name}.", "/profile")
    db.commit()
    db.refresh(t)
    return _serialize_transfer(db, t, coach.id)


@router.get("/transfers/incoming", response_model=List[TransferOut])
def incoming_transfers(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Pending transfers the current user must act on — as destination coach or
    as the athlete being transferred."""
    rows = (
        db.query(AthleteTransfer)
        .filter(
            AthleteTransfer.status == "pending",
            or_(AthleteTransfer.to_coach_id == current_user.id,
                AthleteTransfer.athlete_id == current_user.id),
        )
        .order_by(AthleteTransfer.created_at.asc())
        .all()
    )
    return [_serialize_transfer(db, r, current_user.id) for r in rows]


@router.post("/transfers/{transfer_id}/approve", response_model=TransferOut)
def approve_transfer(
    transfer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Destination coach or athlete approves. When both have approved, the
    transfer completes: coach_id flips and the old coach's future personal
    targets are wiped (group + group workouts untouched)."""
    t = db.get(AthleteTransfer, transfer_id)
    if not t:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if t.status != "pending":
        raise HTTPException(status_code=400, detail="Transfer is not pending")
    if current_user.id == t.to_coach_id:
        t.to_coach_approved = True
    elif current_user.id == t.athlete_id:
        t.athlete_approved = True
    else:
        raise HTTPException(status_code=403, detail="Not a party to this transfer")

    if t.to_coach_approved and t.athlete_approved:
        athlete = db.get(User, t.athlete_id)
        if not athlete:
            raise HTTPException(status_code=404, detail="Athlete no longer exists")
        athlete.coach_id = t.to_coach_id
        # Old coach's future plan is wiped; group workouts are not personal → untouched.
        db.query(IndividualTarget).filter(
            IndividualTarget.athlete_id == t.athlete_id,
            IndividualTarget.date >= date.today(),
        ).delete(synchronize_session=False)
        t.status = "completed"
        t.decided_at = datetime.utcnow()
        notify(db, t.from_coach_id, "transfer_completed",
               f"{athlete.full_name} was transferred to another coach.", "/coach/group")
        notify(db, t.to_coach_id, "transfer_completed",
               f"{athlete.full_name} is now your athlete.", "/coach/group")
        notify(db, t.athlete_id, "transfer_completed",
               "Your coach transfer is complete.", "/profile")
    db.commit()
    db.refresh(t)
    return _serialize_transfer(db, t, current_user.id)


@router.post("/transfers/{transfer_id}/decline", status_code=204)
def decline_transfer(
    transfer_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Destination coach or athlete declines → the transfer is cancelled."""
    t = db.get(AthleteTransfer, transfer_id)
    if not t:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if t.status != "pending":
        raise HTTPException(status_code=400, detail="Transfer is not pending")
    if current_user.id not in (t.to_coach_id, t.athlete_id):
        raise HTTPException(status_code=403, detail="Not a party to this transfer")
    t.status = "declined"
    t.decided_at = datetime.utcnow()
    athlete = db.get(User, t.athlete_id)
    notify(db, t.from_coach_id, "transfer_declined",
           f"The transfer of {athlete.full_name if athlete else 'your athlete'} was declined.",
           "/coach/group")
    db.commit()


@router.delete("/transfers/{transfer_id}", status_code=204)
def cancel_transfer(
    transfer_id: int,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
):
    """Initiating coach cancels a pending transfer they proposed."""
    t = db.get(AthleteTransfer, transfer_id)
    if not t:
        raise HTTPException(status_code=404, detail="Transfer not found")
    if coach.role != "admin" and t.from_coach_id != coach.id:
        raise HTTPException(status_code=403, detail="Not your transfer")
    if t.status != "pending":
        raise HTTPException(status_code=400, detail="Transfer is not pending")
    t.status = "cancelled"
    t.decided_at = datetime.utcnow()
    db.commit()
