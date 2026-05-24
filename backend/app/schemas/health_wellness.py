from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ProfessionalCreate(BaseModel):
    name: str
    specialty: str
    city: str
    phone: str
    price: Optional[str] = None
    notes: Optional[str] = None


class ProfessionalUpdate(BaseModel):
    name: Optional[str] = None
    specialty: Optional[str] = None
    city: Optional[str] = None
    phone: Optional[str] = None
    price: Optional[str] = None
    notes: Optional[str] = None


class ReviewCreate(BaseModel):
    rating: int = Field(..., ge=1, le=5)
    comment: Optional[str] = None


class ReviewOut(BaseModel):
    id: int
    user_id: int
    reviewer_name: str
    rating: int
    comment: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class ProfessionalOut(BaseModel):
    id: int
    name: str
    specialty: str
    city: str
    phone: str
    price: Optional[str]
    notes: Optional[str]
    avg_rating: Optional[float]
    review_count: int
    created_at: datetime

    class Config:
        from_attributes = True
