from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, status
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
    user = User(
        full_name=body.full_name.strip(),
        username=body.username.strip(),
        password_hash=pwd_context.hash(body.password),
        gender=body.gender,
        role="athlete",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token({"sub": user.id, "role": user.role})
    return TokenResponse(access_token=token, role=user.role, full_name=user.full_name, user_id=user.id)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Annotated[Session, Depends(get_db)]):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not pwd_context.verify(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_access_token({"sub": user.id, "role": user.role})
    return TokenResponse(access_token=token, role=user.role, full_name=user.full_name, user_id=user.id)


@router.get("/me", response_model=UserOut)
def me(current_user: Annotated[User, Depends(get_current_user)]):
    return current_user


@router.post("/bootstrap-coach")
def bootstrap_coach(body: BootstrapCoachRequest, db: Annotated[Session, Depends(get_db)]):
    """One-time endpoint to promote the very first user to coach.
    Refuses once any coach already exists, so it's safe to leave deployed."""
    existing_coach = db.query(User).filter(User.role == "coach").first()
    if existing_coach:
        raise HTTPException(status_code=403, detail="A coach already exists. Promote others through the app.")
    user = db.query(User).filter(User.username == body.username.strip()).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    user.role = "coach"
    db.commit()
    return {"username": user.username, "role": user.role, "message": "Logout and log back in to refresh your role."}
