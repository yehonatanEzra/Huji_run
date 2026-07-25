from __future__ import annotations
from datetime import datetime
from pydantic import BaseModel, EmailStr
from typing import Literal, Optional, Union


class RequestCodeRequest(BaseModel):
    email: EmailStr
    purpose: Literal["register", "reset"]


class RegisterRequest(BaseModel):
    full_name: str
    username: str
    password: str
    gender: Literal["M", "F"]
    role: Optional[Literal["athlete", "coach"]] = "athlete"
    email: EmailStr
    # Verification code — only required when REQUIRE_EMAIL_VERIFICATION is on.
    code: str = ""


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    email: EmailStr
    code: str
    new_password: str


class RequestAddEmailRequest(BaseModel):
    email: EmailStr


class AddEmailRequest(BaseModel):
    email: EmailStr
    code: str


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    role: str
    full_name: str
    user_id: int
    training_group_id: Optional[int] = None
    coach_id: Optional[int] = None
    active_team_id: Optional[int] = None


class UserOut(BaseModel):
    id: int
    full_name: str
    username: str
    gender: str
    role: str
    training_group_id: Optional[int] = None
    coach_id: Optional[int] = None
    strava_connected: bool = False
    strava_can_connect: bool = True
    has_photo: bool = False
    active_team_id: Optional[int] = None
    active_team_name: Optional[str] = None
    email: Optional[str] = None
    email_verified: bool = False
    # Accept both a datetime (from the ORM via from_attributes) and a pre-formatted
    # ISO string (e.g. /auth/me passes .isoformat()). Serializes to a string in JSON.
    strava_last_synced_at: Optional[Union[datetime, str]] = None

    model_config = {"from_attributes": True}
