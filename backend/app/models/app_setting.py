from __future__ import annotations
from sqlalchemy import String
from sqlalchemy.orm import Mapped, mapped_column
from ..database import Base


class AppSetting(Base):
    """Generic key-value store for DB-persisted, admin-toggleable runtime
    settings (as opposed to env-var config). First user: strava_block_all."""

    __tablename__ = "app_settings"

    key: Mapped[str] = mapped_column(String(64), primary_key=True)
    value: Mapped[str] = mapped_column(String(255), nullable=False)
