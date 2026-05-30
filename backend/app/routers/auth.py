import os
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import create_access_token, get_current_user
from ..models.user import User
from ..schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserOut


class BootstrapCoachRequest(BaseModel):
    username: str

router = APIRouter(prefix="/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Annotated[Session, Depends(get_db)]):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    # Only athlete/coach can be self-selected on signup. Admin must be promoted
    # manually (see _bootstrap_admin_and_coach_ids in main.py).
    chosen_role = body.role if body.role in ("athlete", "coach") else "athlete"
    user = User(
        full_name=body.full_name.strip(),
        username=body.username.strip(),
        password_hash=pwd_context.hash(body.password),
        gender=body.gender,
        role=chosen_role,
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": user.id, "role": user.role})
    return TokenResponse(access_token=token, role=user.role, full_name=user.full_name, user_id=user.id, training_group_id=user.training_group_id, coach_id=user.coach_id)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Annotated[Session, Depends(get_db)]):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not pwd_context.verify(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": user.id, "role": user.role})
    return TokenResponse(access_token=token, role=user.role, full_name=user.full_name, user_id=user.id, training_group_id=user.training_group_id, coach_id=user.coach_id)


@router.get("/me", response_model=UserOut)
def me(current_user: Annotated[User, Depends(get_current_user)]):
    return current_user


@router.post("/bootstrap-coach")
def bootstrap_coach(
    body: BootstrapCoachRequest,
    db: Annotated[Session, Depends(get_db)],
    x_bootstrap_secret: Annotated[Optional[str], Header(alias="X-Bootstrap-Secret")] = None,
):
    """One-time endpoint to promote the very first user to coach.

    Defense in depth:
      1. Requires X-Bootstrap-Secret header matching the BOOTSTRAP_SECRET env var.
         If the env var is unset, the endpoint is completely disabled (secure by default).
      2. Refuses once any coach already exists, so even with the secret it can only
         be used to seed the very first coach.
    """
    expected = os.environ.get("BOOTSTRAP_SECRET")
    if not expected:
        raise HTTPException(status_code=403, detail="Bootstrap disabled.")
    if not x_bootstrap_secret or x_bootstrap_secret != expected:
        raise HTTPException(status_code=403, detail="Invalid bootstrap secret.")

    existing_coach = db.query(User).filter(User.role == "coach").first()
    if existing_coach:
        raise HTTPException(status_code=403, detail="A coach already exists. Promote others through the app.")

    user = db.query(User).filter(User.username == body.username.strip()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = "coach"
    db.commit()
    return {"username": user.username, "role": user.role, "message": "Logout and log back in to refresh your role."}
