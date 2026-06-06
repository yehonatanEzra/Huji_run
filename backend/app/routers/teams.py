from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user, create_access_token
from ..models.user import User
from ..models.team import Team, TeamMembership
from ..schemas.auth import TokenResponse

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

    model_config = {"from_attributes": True}


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
    return [MyTeamOut(id=team.id, name=team.name, role=membership.role) for membership, team in rows]


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
