from __future__ import annotations
from sqlalchemy.orm import Session
from ..models.app_setting import AppSetting

# Setting keys
STRAVA_BLOCK_ALL = "strava_block_all"


def get_bool(db: Session, key: str, default: bool = False) -> bool:
    row = db.get(AppSetting, key)
    if row is None:
        return default
    return row.value == "true"


def set_bool(db: Session, key: str, value: bool) -> None:
    """Upsert a boolean setting. Caller commits."""
    row = db.get(AppSetting, key)
    val = "true" if value else "false"
    if row is None:
        db.add(AppSetting(key=key, value=val))
    else:
        row.value = val
