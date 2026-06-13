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

router = APIRouter(prefix="/groups", tags=["group-coaches"])


class CoachOut(BaseModel):
    user_id: int
    full_name: str
    username: str
    role: str


class AddCoachRequest(BaseModel):
    user_id: int
    role: str = "assistant"


class TransferRequest(BaseModel):
    new_main_user_id: int


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


@router.post("/{group_id}/coaches", response_model=CoachOut, status_code=status.HTTP_201_CREATED)
def add_coach(
    group_id: int,
    body: AddCoachRequest,
    actor: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
):
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

    gc = GroupCoach(user_id=body.user_id, group_id=group_id, role=body.role)
    db.add(gc)
    db.commit()
    return CoachOut(user_id=target.id, full_name=target.full_name, username=target.username, role=gc.role)


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
