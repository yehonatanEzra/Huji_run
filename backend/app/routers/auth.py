import hmac
import hashlib
import logging
import os
import random
from datetime import datetime, timedelta, timezone
from typing import Annotated, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, Header, HTTPException, status
from passlib.context import CryptContext
from pydantic import BaseModel
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import create_access_token, get_current_user, get_active_team_id
from ..models.user import User
from ..models.team import Team, TeamMembership
from ..models.email_verification import EmailVerification
from ..schemas.auth import (
    RegisterRequest, LoginRequest, TokenResponse, UserOut,
    RequestCodeRequest, ForgotPasswordRequest, ResetPasswordRequest,
    RequestAddEmailRequest, AddEmailRequest,
)
from ..services.email import send_email
from ..config import settings

log = logging.getLogger(__name__)

router = APIRouter(prefix="/auth", tags=["auth"])
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


class BootstrapCoachRequest(BaseModel):
    username: str


class SwitchTeamRequest(BaseModel):
    team_id: int


# --- Code helpers ---

def _gen_code() -> str:
    return f"{random.SystemRandom().randint(0, 999999):06d}"


def _hash_code(code: str) -> str:
    return hmac.new(settings.JWT_SECRET.encode(), code.encode(), hashlib.sha256).hexdigest()


def _verify_code(code: str, code_hash: str) -> bool:
    return hmac.compare_digest(_hash_code(code), code_hash)


def _send_code(to_email: str, purpose: str, code: str) -> None:
    if purpose == "register":
        subject = "Your Huji Run verification code"
        body = f"Your verification code is: {code}\n\nIt expires in 10 minutes."
    else:
        subject = "Reset your Huji Run password"
        body = f"Your password-reset code is: {code}\n\nIt expires in 10 minutes."
    send_email(to_email, subject, body)


def _throttle_check(db: Session, email: str, purpose: str) -> None:
    """Raise 429 if the user is sending codes too fast or has exceeded the hourly cap."""
    now = datetime.now(timezone.utc)
    cutoff_60s = now - timedelta(seconds=60)
    cutoff_1h = now - timedelta(hours=1)

    recent = db.query(EmailVerification).filter(
        EmailVerification.email == email,
        EmailVerification.purpose == purpose,
        EmailVerification.consumed_at.is_(None),
        EmailVerification.created_at > cutoff_60s,
    ).first()
    if recent:
        raise HTTPException(status_code=429, detail="Please wait before requesting another code")

    count_1h = db.query(EmailVerification).filter(
        EmailVerification.email == email,
        EmailVerification.purpose == purpose,
        EmailVerification.consumed_at.is_(None),
        EmailVerification.created_at > cutoff_1h,
    ).count()
    if count_1h >= 5:
        raise HTTPException(status_code=429, detail="Too many code requests. Try again in an hour")


def _create_verification(db: Session, email: str, purpose: str) -> str:
    code = _gen_code()
    row = EmailVerification(
        email=email,
        code_hash=_hash_code(code),
        purpose=purpose,
        expires_at=datetime.now(timezone.utc) + timedelta(minutes=10),
    )
    db.add(row)
    db.commit()
    return code


def _validate_and_consume(db: Session, email: str, purpose: str, code: str) -> None:
    """Validate the code and mark it consumed. Raises 400 on any failure."""
    row = (
        db.query(EmailVerification)
        .filter(
            EmailVerification.email == email,
            EmailVerification.purpose == purpose,
            EmailVerification.consumed_at.is_(None),
        )
        .order_by(EmailVerification.created_at.desc())
        .first()
    )

    err = HTTPException(status_code=400, detail="Invalid or expired code")

    if row is None:
        raise err

    now = datetime.now(timezone.utc)
    expires = row.expires_at if row.expires_at.tzinfo else row.expires_at.replace(tzinfo=timezone.utc)

    if now > expires or row.attempts >= 5:
        raise err

    if not _verify_code(code, row.code_hash):
        row.attempts += 1
        if row.attempts >= 5:
            row.consumed_at = now
        db.commit()
        raise err

    row.consumed_at = now
    db.commit()


# --- Team helpers ---

def _primary_team_id(db: Session, user_id: int) -> Optional[int]:
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


# --- Endpoints ---

@router.post("/request-code", status_code=status.HTTP_200_OK)
def request_code(body: RequestCodeRequest, background: BackgroundTasks, db: Annotated[Session, Depends(get_db)]):
    """Send a verification code to `email`. Generic 200 even if email is already taken,
    so we don't leak account existence for the register flow."""
    email = body.email.lower()

    if body.purpose == "register":
        existing = db.query(User).filter(User.email == email, User.email_verified == True).first()  # noqa: E712
        if existing:
            # Silently succeed — don't reveal the account exists
            return {"detail": "If that email is available, we sent a code"}

    _throttle_check(db, email, body.purpose)
    code = _create_verification(db, email, body.purpose)
    # Send after the response returns so SMTP latency never blocks the request.
    background.add_task(_send_code, email, body.purpose, code)
    return {"detail": "Code sent"}


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
def register(body: RegisterRequest, db: Annotated[Session, Depends(get_db)]):
    email = body.email.lower()

    # Validate email code — only when verification is required. Otherwise anyone
    # can register with any email (no code), and it's marked verified so the
    # "add your email" banner doesn't nag.
    if settings.REQUIRE_EMAIL_VERIFICATION:
        _validate_and_consume(db, email, "register", body.code)

    if db.query(User).filter(User.username == body.username).first():
        raise HTTPException(status_code=400, detail="Username already taken")
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(status_code=400, detail="Email already registered")

    chosen_role = body.role if body.role in ("athlete", "coach") else "athlete"
    user = User(
        full_name=body.full_name.strip(),
        username=body.username.strip(),
        password_hash=pwd_context.hash(body.password),
        gender=body.gender,
        role=chosen_role,
        email=email,
        email_verified=True,
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    if user.role == "coach":
        default_team = db.query(Team).order_by(Team.id).first()
        if default_team is not None and not db.query(TeamMembership).filter(
            TeamMembership.user_id == user.id, TeamMembership.team_id == default_team.id
        ).first():
            db.add(TeamMembership(user_id=user.id, team_id=default_team.id, role="main"))
            db.commit()

    return _token_response(db, user)


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, db: Annotated[Session, Depends(get_db)]):
    user = db.query(User).filter(User.username == body.username).first()
    if not user or not pwd_context.verify(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return _token_response(db, user)


@router.get("/me", response_model=UserOut)
def me(
    current_user: Annotated[User, Depends(get_current_user)],
    active_team_id: Annotated[Optional[int], Depends(get_active_team_id)],
    db: Annotated[Session, Depends(get_db)],
):
    active_team_name: Optional[str] = None
    if active_team_id is not None:
        team = db.get(Team, active_team_id)
        active_team_name = team.name if team else None
    return UserOut(
        id=current_user.id,
        full_name=current_user.full_name,
        username=current_user.username,
        gender=current_user.gender,
        role=current_user.role,
        training_group_id=current_user.training_group_id,
        coach_id=current_user.coach_id,
        strava_connected=current_user.strava_connected,
        has_photo=current_user.has_photo,
        active_team_id=active_team_id,
        active_team_name=active_team_name,
        email=current_user.email,
        email_verified=current_user.email_verified,
    )


@router.post("/forgot-password", status_code=status.HTTP_200_OK)
def forgot_password(body: ForgotPasswordRequest, background: BackgroundTasks, db: Annotated[Session, Depends(get_db)]):
    """Always returns 200 to avoid leaking whether the email is registered."""
    email = body.email.lower()
    user = db.query(User).filter(User.email == email, User.email_verified == True).first()  # noqa: E712
    if user:
        _throttle_check(db, email, "reset")
        code = _create_verification(db, email, "reset")
        background.add_task(_send_code, email, "reset", code)
    return {"detail": "If that email is registered, we sent a reset code"}


@router.post("/reset-password", status_code=status.HTTP_200_OK)
def reset_password(body: ResetPasswordRequest, db: Annotated[Session, Depends(get_db)]):
    email = body.email.lower()
    _validate_and_consume(db, email, "reset", body.code)

    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=400, detail="Invalid or expired code")

    user.password_hash = pwd_context.hash(body.new_password)
    db.commit()
    return {"detail": "Password updated. Please log in with your new password"}


@router.post("/request-add-email", status_code=status.HTTP_200_OK)
def request_add_email(
    body: RequestAddEmailRequest,
    background: BackgroundTasks,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    email = body.email.lower()
    conflict = db.query(User).filter(User.email == email).first()
    if conflict and conflict.id != current_user.id:
        raise HTTPException(status_code=409, detail="Email already in use")

    _throttle_check(db, email, "register")
    code = _create_verification(db, email, "register")
    background.add_task(_send_code, email, "register", code)
    return {"detail": "Code sent"}


@router.post("/add-email", status_code=status.HTTP_200_OK)
def add_email(
    body: AddEmailRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    email = body.email.lower()
    _validate_and_consume(db, email, "register", body.code)

    conflict = db.query(User).filter(User.email == email).first()
    if conflict and conflict.id != current_user.id:
        raise HTTPException(status_code=409, detail="Email already in use by another account")

    current_user.email = email
    current_user.email_verified = True
    db.commit()
    return {"detail": "Email verified and saved"}


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
    """One-time endpoint to promote the very first user to coach."""
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
