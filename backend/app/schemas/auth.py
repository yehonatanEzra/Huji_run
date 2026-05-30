from __future__ import annotations
from pydantic import BaseModel
from typing import Literal, Optional


class RegisterRequest(BaseModel):
    full_name: str
    username: str
    password: str
    gender: Literal["M", "F"]


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


class UserOut(BaseModel):
    id: int
    full_name: str
    username: str
    gender: str
    role: str
    training_group_id: Optional[int] = None
    coach_id: Optional[int] = None

    model_config = {"from_attributes": True}
