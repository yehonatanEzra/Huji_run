from __future__ import annotations
from datetime import datetime
from typing import Optional
from sqlalchemy import Integer, String, Float, Text, DateTime, ForeignKey, func, CheckConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from ..database import Base


class HealthProfessional(Base):
    __tablename__ = "health_professionals"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String(150), nullable=False)
    specialty: Mapped[str] = mapped_column(String(100), nullable=False)
    city: Mapped[str] = mapped_column(String(100), nullable=False)
    phone: Mapped[str] = mapped_column(String(30), nullable=False)
    price: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_by_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    created_by = relationship("User", foreign_keys=[created_by_id])
    reviews = relationship("HealthReview", back_populates="professional", cascade="all, delete-orphan")


class HealthReview(Base):
    __tablename__ = "health_reviews"
    __table_args__ = (
        CheckConstraint("rating >= 1 AND rating <= 5", name="ck_rating_range"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    professional_id: Mapped[int] = mapped_column(Integer, ForeignKey("health_professionals.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    rating: Mapped[int] = mapped_column(Integer, nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    professional = relationship("HealthProfessional", back_populates="reviews")
    user = relationship("User", foreign_keys=[user_id])
