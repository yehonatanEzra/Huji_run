from __future__ import annotations
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from sqlalchemy.orm import Session
from .config import settings
from .database import get_db
from .models.user import User

bearer_scheme = HTTPBearer()
optional_bearer = HTTPBearer(auto_error=False)


def create_access_token(data: dict) -> str:
    payload = data.copy()
    payload["sub"] = str(payload["sub"])
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload["exp"] = expire
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def get_current_user(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        sub = payload.get("sub")
        if sub is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
        user_id = int(sub)
    except (JWTError, ValueError):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="User not found")
    return user


def require_coach(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    """Allow coach OR admin. Admin is a superset of coach permissions."""
    if current_user.role not in ("coach", "admin"):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Coach access required")
    return current_user


def require_admin(current_user: Annotated[User, Depends(get_current_user)]) -> User:
    """Strict admin-only gate. Used for: rename/delete users, race writes,
    HoF challenge writes, and global feed broadcasts."""
    if current_user.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin access required")
    return current_user


def get_active_team_id(
    credentials: Annotated[HTTPAuthorizationCredentials, Depends(bearer_scheme)],
) -> Optional[int]:
    """Extract active_team_id from JWT without a DB round-trip. Returns None for old tokens."""
    try:
        payload = jwt.decode(credentials.credentials, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        val = payload.get("active_team_id")
        return int(val) if val is not None else None
    except (JWTError, ValueError):
        return None


def get_optional_user(
    credentials: Annotated[Optional[HTTPAuthorizationCredentials], Depends(optional_bearer)],
    db: Annotated[Session, Depends(get_db)],
) -> Optional[User]:
    """Returns the authenticated user if a valid JWT is present, None otherwise.
    Never raises 401 — designed for routes that are public but can personalise
    when the caller is logged in."""
    if credentials is None:
        return None
    try:
        payload = jwt.decode(credentials.credentials, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
        sub = payload.get("sub")
        if sub is None:
            return None
        user_id = int(sub)
    except (JWTError, ValueError):
        return None
    return db.get(User, user_id)


def verify_team_access(user: User, team_id: int, db: Session) -> None:
    """Raise 403 if user is not a member of team_id.
    Call directly (not via Depends) since team_id is route-specific."""
    from .models.team import TeamMembership
    membership = (
        db.query(TeamMembership)
        .filter(TeamMembership.user_id == user.id, TeamMembership.team_id == team_id)
        .first()
    )
    if membership is None:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not a member of this team")
