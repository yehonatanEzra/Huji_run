from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user, create_access_token, get_active_team_id
from .auth import _primary_team_id
from ..models.user import User
from ..models.team import Team, TeamMembership
from ..schemas.auth import TokenResponse
from .public import build_team_profile, PublicTeamProfile

router = APIRouter(prefix="/teams", tags=["teams"])


class TeamCreateRequest(BaseModel):
    name: str
    description: Optional[str] = None
    sport: Optional[str] = None
    location: Optional[str] = None


class TeamOut(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    sport: Optional[str] = None
    location: Optional[str] = None
    is_public: bool

    model_config = {"from_attributes": True}


class TeamCreateResponse(BaseModel):
    team: TeamOut
    access_token: str
    token_type: str = "bearer"
    active_team_id: int


class MyTeamOut(BaseModel):
    id: int
    name: str
    role: str
    is_public: bool = False

    model_config = {"from_attributes": True}


class TeamUpdateRequest(BaseModel):
    is_public: Optional[bool] = None
    description: Optional[str] = None
    sport: Optional[str] = None
    location: Optional[str] = None


@router.get("/my", response_model=list[MyTeamOut])
def my_teams(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    rows = (
        db.query(TeamMembership, Team)
        .join(Team, TeamMembership.team_id == Team.id)
        .filter(TeamMembership.user_id == current_user.id)
        .all()
    )
    return [MyTeamOut(id=team.id, name=team.name, role=membership.role, is_public=team.is_public) for membership, team in rows]


@router.get("/{team_id}/profile", response_model=PublicTeamProfile)
def team_profile(
    team_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    active_team_id: Annotated[Optional[int], Depends(get_active_team_id)] = None,
):
    """In-app team profile (Hall of Fame + recent results) for members and staff.
    Athletes have no TeamMembership row — their team comes from the JWT
    (active_team_id) — so accept either a membership or a matching active team."""
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")
    # Authorize via the same resolver used for the JWT/`/auth/me`: admin, the
    # token's active team, or the user's resolved team (membership → training
    # group → coach). Reusing it keeps athlete access consistent everywhere and
    # covers older tokens that still carry no active_team_id.
    if (
        current_user.role != "admin"
        and active_team_id != team_id
        and _primary_team_id(db, current_user.id) != team_id
    ):
        raise HTTPException(status_code=403, detail="You are not a member of this team")
    return build_team_profile(db, team)


@router.patch("/{team_id}", response_model=TeamOut)
def update_team(
    team_id: int,
    body: TeamUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    team = db.get(Team, team_id)
    if team is None:
        raise HTTPException(status_code=404, detail="Team not found")
    if current_user.role != "admin":
        membership = (
            db.query(TeamMembership)
            .filter(
                TeamMembership.team_id == team_id,
                TeamMembership.user_id == current_user.id,
                TeamMembership.role == "main",
            )
            .first()
        )
        if membership is None:
            raise HTTPException(status_code=403, detail="Only the team's main coach can edit it")
    if body.is_public is not None:
        team.is_public = body.is_public
    if body.description is not None:
        team.description = body.description.strip() or None
    if body.sport is not None:
        team.sport = body.sport.strip() or None
    if body.location is not None:
        team.location = body.location.strip() or None
    db.commit()
    db.refresh(team)
    return team


@router.post("/", response_model=TeamCreateResponse, status_code=status.HTTP_201_CREATED)
def create_team(
    body: TeamCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    if current_user.role not in ("coach", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only coaches can create teams")

    name = (body.name or "").strip()
    if not name:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail="Team name is required")

    team = Team(
        name=name,
        description=body.description,
        sport=body.sport,
        location=body.location,
        created_by_id=current_user.id,
    )
    db.add(team)
    db.flush()

    membership = TeamMembership(user_id=current_user.id, team_id=team.id, role="main")
    db.add(membership)
    db.commit()
    db.refresh(team)

    token = create_access_token({"sub": current_user.id, "role": current_user.role, "active_team_id": team.id})
    return TeamCreateResponse(team=TeamOut.model_validate(team), access_token=token, active_team_id=team.id)
