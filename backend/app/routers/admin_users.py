"""Admin-only user management: list every user, rename, change role,
delete. Mounted at /admin/users.

The list endpoint joins User → TrainingGroup → User (self-join on
coach) in a single query so each row carries everything the admin UI
needs (no per-row N+1 fetches)."""
from __future__ import annotations
from typing import Annotated, List, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session, aliased

from ..database import get_db
from ..dependencies import require_admin
from ..models.user import User
from ..models.training_group import TrainingGroup
from ..services.user_management import (
    cascade_delete_user,
    change_user_role,
    rename_user,
)

router = APIRouter(prefix="/admin/users", tags=["admin-users"])


class AdminUserOut(BaseModel):
    id: int
    full_name: str
    username: str
    role: str
    gender: str
    training_group_id: Optional[int] = None
    training_group_name: Optional[str] = None
    coach_id: Optional[int] = None
    coach_name: Optional[str] = None
    photo_url: Optional[str] = None
    has_strava: bool = False
    athletes_count: int = 0


class AdminUserListResponse(BaseModel):
    users: List[AdminUserOut]


class AdminUserPatch(BaseModel):
    full_name: Optional[str] = Field(default=None)
    role: Optional[str] = Field(default=None)


def _serialize(
    user: User,
    group_name: Optional[str],
    coach_name: Optional[str],
    athletes_count: int,
) -> AdminUserOut:
    return AdminUserOut(
        id=user.id,
        full_name=user.full_name,
        username=user.username,
        role=user.role,
        gender=user.gender,
        training_group_id=user.training_group_id,
        training_group_name=group_name,
        coach_id=user.coach_id,
        coach_name=coach_name,
        photo_url=f"/api/v1/profile/photo/{user.id}" if user.photo_filename else None,
        has_strava=bool(user.strava_access_token),
        athletes_count=athletes_count,
    )


@router.get("", response_model=AdminUserListResponse)
def list_users(
    db: Annotated[Session, Depends(get_db)],
    _admin: Annotated[User, Depends(require_admin)],
):
    Coach = aliased(User)
    rows = (
        db.query(User, TrainingGroup.name, Coach.full_name)
        .outerjoin(TrainingGroup, User.training_group_id == TrainingGroup.id)
        .outerjoin(Coach, User.coach_id == Coach.id)
        .order_by(User.role.asc(), sa_func.lower(User.full_name).asc())
        .all()
    )
    # athletes_count: how many athletes have this user as coach.
    counts = dict(
        db.query(User.coach_id, sa_func.count(User.id))
        .filter(User.role == "athlete", User.coach_id.isnot(None))
        .group_by(User.coach_id)
        .all()
    )
    out = [
        _serialize(user, group_name, coach_name, counts.get(user.id, 0))
        for (user, group_name, coach_name) in rows
    ]
    return AdminUserListResponse(users=out)


def _fetch_user_view(db: Session, user: User) -> AdminUserOut:
    group_name = None
    if user.training_group_id:
        g = db.get(TrainingGroup, user.training_group_id)
        group_name = g.name if g else None
    coach_name = None
    if user.coach_id:
        c = db.get(User, user.coach_id)
        coach_name = c.full_name if c else None
    athletes_count = (
        db.query(sa_func.count(User.id))
        .filter(User.role == "athlete", User.coach_id == user.id)
        .scalar()
        or 0
    )
    return _serialize(user, group_name, coach_name, athletes_count)


@router.patch("/{user_id}", response_model=AdminUserOut)
def patch_user(
    user_id: int,
    body: AdminUserPatch,
    db: Annotated[Session, Depends(get_db)],
    admin: Annotated[User, Depends(require_admin)],
):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")

    if body.role is not None and target.id == admin.id and body.role != "admin":
        raise HTTPException(status_code=400, detail="Cannot demote yourself out of admin")

    if body.full_name is not None:
        rename_user(db, target, body.full_name)
    if body.role is not None:
        change_user_role(db, target, body.role)

    return _fetch_user_view(db, target)


@router.delete("/{user_id}", status_code=204)
def delete_user(
    user_id: int,
    db: Annotated[Session, Depends(get_db)],
    admin: Annotated[User, Depends(require_admin)],
):
    target = db.get(User, user_id)
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    cascade_delete_user(db, target, admin)
