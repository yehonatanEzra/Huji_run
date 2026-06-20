from datetime import datetime
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import or_
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user, require_coach, get_active_team_id
from ..models.team import TeamMembership
from ..models.user import User
from ..models.training_group import TrainingGroup
from ..models.group_coach import GroupCoach
from ..models.group_add_request import GroupAddRequest
from ..models.group_coach_invite import GroupCoachInvite
from ..services.notifications import notify

router = APIRouter(prefix="/groups", tags=["group-coaches"])


class CoachOut(BaseModel):
    user_id: int
    full_name: str
    username: str
    role: str


class AddCoachRequest(BaseModel):
    user_id: int
    role: str = "assistant"


class CoachInviteOut(BaseModel):
    id: int
    group_id: int
    group_name: str
    invited_user_id: int
    invited_user_name: str
    invited_by_id: int
    invited_by_name: str
    role: str
    status: str
    created_at: datetime


class TransferRequest(BaseModel):
    new_main_user_id: int


def _serialize_invite(db: Session, inv: GroupCoachInvite) -> CoachInviteOut:
    group = db.get(TrainingGroup, inv.group_id)
    invited = db.get(User, inv.invited_user_id)
    inviter = db.get(User, inv.invited_by_id)
    return CoachInviteOut(
        id=inv.id,
        group_id=inv.group_id,
        group_name=group.name if group else "(unknown)",
        invited_user_id=inv.invited_user_id,
        invited_user_name=invited.full_name if invited else "(unknown)",
        invited_by_id=inv.invited_by_id,
        invited_by_name=inviter.full_name if inviter else "(unknown)",
        role=inv.role,
        status=inv.status,
        created_at=inv.created_at,
    )


def _require_main_coach(group: TrainingGroup, actor: User, db: Session) -> GroupCoach:
    """Raise 403 unless actor is the main coach of the group."""
    gc = db.query(GroupCoach).filter(
        GroupCoach.group_id == group.id,
        GroupCoach.user_id == actor.id,
        GroupCoach.role == "main",
    ).first()
    if gc is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Main coach access required")
    return gc


@router.get("/coaches/search")
def search_coaches(
    q: Annotated[str, Query(min_length=1)],
    _actor: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
    active_team_id: Annotated[Optional[int], Depends(get_active_team_id)] = None,
):
    """Search coach/admin users by name OR username/email (substring), scoped to
    the active team. Usernames currently hold email-style logins, so this doubles
    as email search; point it at a dedicated email column once one exists."""
    like = f"%{q}%"
    query = db.query(User).filter(
        User.role.in_(("coach", "admin")),
        or_(User.full_name.ilike(like), User.username.ilike(like)),
    )
    if active_team_id is not None:
        member_ids = db.query(TeamMembership.user_id).filter(
            TeamMembership.team_id == active_team_id
        )
        query = query.filter(User.id.in_(member_ids))
    results = query.order_by(User.full_name).limit(10).all()
    return [{"id": u.id, "full_name": u.full_name, "username": u.username, "role": u.role}
            for u in results]


@router.get("/{group_id}/coaches", response_model=list[CoachOut])
def list_coaches(
    group_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    group = db.get(TrainingGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")

    rows = (
        db.query(GroupCoach, User)
        .join(User, GroupCoach.user_id == User.id)
        .filter(GroupCoach.group_id == group_id)
        .all()
    )
    return [CoachOut(user_id=u.id, full_name=u.full_name, username=u.username, role=gc.role)
            for gc, u in rows]


@router.post("/{group_id}/coaches", response_model=CoachInviteOut, status_code=status.HTTP_201_CREATED)
def add_coach(
    group_id: int,
    body: AddCoachRequest,
    actor: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    """Invite a coach to co-coach this group. The invited coach must accept
    before a GroupCoach row is created — this does not add them directly."""
    group = db.get(TrainingGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    _require_main_coach(group, actor, db)

    if body.role not in ("main", "assistant"):
        raise HTTPException(status_code=422, detail="role must be 'main' or 'assistant'")

    target = db.get(User, body.user_id)
    if target is None or target.role not in ("coach", "admin"):
        raise HTTPException(status_code=404, detail="Coach not found")

    existing = db.query(GroupCoach).filter(
        GroupCoach.group_id == group_id, GroupCoach.user_id == body.user_id
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="User is already a coach of this group")

    pending = db.query(GroupCoachInvite).filter(
        GroupCoachInvite.group_id == group_id,
        GroupCoachInvite.invited_user_id == body.user_id,
        GroupCoachInvite.status == "pending",
    ).first()
    if pending:
        raise HTTPException(status_code=409, detail="An invitation is already pending for this coach")

    inv = GroupCoachInvite(
        group_id=group_id, invited_user_id=body.user_id,
        invited_by_id=actor.id, role=body.role, status="pending",
    )
    db.add(inv)
    db.flush()
    notify(db, target.id, "coach_invite",
           f"{actor.full_name} invited you to co-coach “{group.name}”.", "/coach/requests")
    db.commit()
    db.refresh(inv)
    return _serialize_invite(db, inv)


@router.get("/coach-invites/incoming", response_model=list[CoachInviteOut])
def incoming_coach_invites(
    actor: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    """Pending co-coach invitations addressed to the current coach."""
    rows = (
        db.query(GroupCoachInvite)
        .filter(GroupCoachInvite.invited_user_id == actor.id, GroupCoachInvite.status == "pending")
        .order_by(GroupCoachInvite.created_at.asc())
        .all()
    )
    return [_serialize_invite(db, r) for r in rows]


@router.get("/{group_id}/coach-invites", response_model=list[CoachInviteOut])
def list_group_coach_invites(
    group_id: int,
    actor: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    """Pending invitations for a group (main coach view)."""
    group = db.get(TrainingGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    _require_main_coach(group, actor, db)
    rows = (
        db.query(GroupCoachInvite)
        .filter(GroupCoachInvite.group_id == group_id, GroupCoachInvite.status == "pending")
        .order_by(GroupCoachInvite.created_at.asc())
        .all()
    )
    return [_serialize_invite(db, r) for r in rows]


@router.post("/coach-invites/{invite_id}/accept", response_model=CoachOut)
def accept_coach_invite(
    invite_id: int,
    actor: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    """Invited coach accepts → a GroupCoach row is created."""
    inv = db.get(GroupCoachInvite, invite_id)
    if inv is None:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if inv.invited_user_id != actor.id:
        raise HTTPException(status_code=403, detail="Not your invitation")
    if inv.status != "pending":
        raise HTTPException(status_code=400, detail="Invitation is not pending")

    existing = db.query(GroupCoach).filter(
        GroupCoach.group_id == inv.group_id, GroupCoach.user_id == actor.id
    ).first()
    if existing is None:
        db.add(GroupCoach(user_id=actor.id, group_id=inv.group_id, role=inv.role))
    inv.status = "accepted"
    inv.decided_at = datetime.utcnow()
    group = db.get(TrainingGroup, inv.group_id)
    notify(db, inv.invited_by_id, "coach_invite_accepted",
           f"{actor.full_name} accepted your invitation to co-coach “{group.name if group else ''}”.",
           "/coach/group")
    db.commit()
    return CoachOut(user_id=actor.id, full_name=actor.full_name, username=actor.username, role=inv.role)


@router.post("/coach-invites/{invite_id}/decline", status_code=status.HTTP_204_NO_CONTENT)
def decline_coach_invite(
    invite_id: int,
    actor: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    """Invited coach declines the invitation."""
    inv = db.get(GroupCoachInvite, invite_id)
    if inv is None:
        raise HTTPException(status_code=404, detail="Invitation not found")
    if inv.invited_user_id != actor.id:
        raise HTTPException(status_code=403, detail="Not your invitation")
    if inv.status != "pending":
        raise HTTPException(status_code=400, detail="Invitation is not pending")
    inv.status = "declined"
    inv.decided_at = datetime.utcnow()
    group = db.get(TrainingGroup, inv.group_id)
    notify(db, inv.invited_by_id, "coach_invite_declined",
           f"{actor.full_name} declined your invitation to co-coach “{group.name if group else ''}”.",
           "/coach/group")
    db.commit()


@router.delete("/coach-invites/{invite_id}", status_code=status.HTTP_204_NO_CONTENT)
def withdraw_coach_invite(
    invite_id: int,
    actor: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    """Main coach withdraws a pending invitation they sent."""
    inv = db.get(GroupCoachInvite, invite_id)
    if inv is None:
        raise HTTPException(status_code=404, detail="Invitation not found")
    group = db.get(TrainingGroup, inv.group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    _require_main_coach(group, actor, db)
    if inv.status != "pending":
        raise HTTPException(status_code=400, detail="Invitation is not pending")
    inv.status = "withdrawn"
    inv.decided_at = datetime.utcnow()
    db.commit()


@router.delete("/{group_id}/coaches/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_coach(
    group_id: int,
    user_id: int,
    actor: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    group = db.get(TrainingGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    _require_main_coach(group, actor, db)

    gc = db.query(GroupCoach).filter(
        GroupCoach.group_id == group_id, GroupCoach.user_id == user_id
    ).first()
    if gc is None:
        raise HTTPException(status_code=404, detail="Coach not found in this group")
    if gc.role == "main":
        raise HTTPException(status_code=400, detail="Cannot remove the main coach; transfer ownership first")

    # An assistant losing the group can no longer have pending adds awaiting approval there.
    db.query(GroupAddRequest).filter(
        GroupAddRequest.group_id == group_id,
        GroupAddRequest.requested_by_id == user_id,
    ).delete(synchronize_session=False)
    db.delete(gc)
    db.commit()


@router.patch("/{group_id}/transfer", status_code=status.HTTP_200_OK)
def transfer_ownership(
    group_id: int,
    body: TransferRequest,
    actor: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
    group = db.get(TrainingGroup, group_id)
    if group is None:
        raise HTTPException(status_code=404, detail="Group not found")
    current_main = _require_main_coach(group, actor, db)

    new_main = db.query(GroupCoach).filter(
        GroupCoach.group_id == group_id, GroupCoach.user_id == body.new_main_user_id
    ).first()
    if new_main is None:
        raise HTTPException(status_code=404, detail="Target user is not a coach of this group")

    current_main.role = "assistant"
    new_main.role = "main"
    db.commit()
    return {"ok": True}
