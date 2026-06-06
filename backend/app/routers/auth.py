import os
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, Header, HTTPException, status
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import create_access_token, get_current_user
from ..models.user import User
from ..models.team import Team, TeamMembership
from ..schemas.auth import RegisterRequest, LoginRequest, TokenResponse, UserOut


class BootstrapCoachRequest(BaseModel):
    username: str


class SwitchTeamRequest(BaseModel):
    team_id: int


router = APIRouter(prefix="/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def _primary_team_id(db: Session, user_id: int) -> Optional[int]:
    """Return the user's primary team_id, falling back to any membership."""
    m = (
        db.query(TeamMembership)
        .filter(TeamMembership.user_id == user_id, TeamMembership.role == "main")
        .first()
    )
    if m is None:
        m = db.query(TeamMembership).filter(TeamMembership.user_id == user_id).first()
    return m.team_id if m else None


def _token_response(db: Session, user: User, active_team_id: Optional[int] = None) -> TokenResponse:
    if active_team_id is None:
        active_team_id = _primary_team_id(db, user.id)
    token = create_access_token({"sub": user.id, "role": user.role, "active_team_id": active_team_id})
    return TokenResponse(
        access_token=token,
        role=user.role,
        full_name=user.full_name,
        user_id=user.id,
        training_group_id=user.training_group_id,
        coach_id=user.coach_id,
        active_team_id=active_team_id,
    )


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Annotated[Session, Depends(get_db)]):
    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
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
    return _token_response(db, user)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Annotated[Session, Depends(get_db)]):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not pwd_context.verify(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return _token_response(db, user)


@router.get("/me", response_model=UserOut)
def me(current_user: Annotated[User, Depends(get_current_user)], db: Annotated[Session, Depends(get_db)]):
    active_team_id = _primary_team_id(db, current_user.id)
    active_team_name: Optional[str] = None
    if active_team_id is not None:
        team = db.get(Team, active_team_id)
        active_team_name = team.name if team else None
    # Attach as transient attributes so Pydantic's from_attributes can read them.
    current_user.active_team_id = active_team_id
    current_user.active_team_name = active_team_name
    return current_user


@router.post("/switch-team", response_model=TokenResponse)
def switch_team(
    body: SwitchTeamRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    membership = (
        db.query(TeamMembership)
        .filter(TeamMembership.user_id == current_user.id, TeamMembership.team_id == body.team_id)
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=403, detail="Not a member of that team")
    return _token_response(db, current_user, active_team_id=body.team_id)


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
