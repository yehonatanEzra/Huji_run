from __future__ import annotations
from pydantic import BaseModel, EmailStr
from typing import Literal, Optional


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
    code: str


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
    has_photo: bool = False
    active_team_id: Optional[int] = None
    active_team_name: Optional[str] = None
    email: Optional[str] = None
    email_verified: bool = False

    model_config = {"from_attributes": True}
