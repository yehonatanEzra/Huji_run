from __future__ import annotations
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..models.kudos import Kudos
from ..models.workout import WorkoutLog

router = APIRouter(prefix="/kudos", tags=["kudos"])

ALLOWED_EMOJI = {"clap", "heart", "dislike"}


class KudosToggle(BaseModel):
    emoji: str = "clap"


def _build_reactions(db: Session, workout_log_id: int, user_id: int):
    counts = dict(
        db.query(Kudos.emoji, sa_func.count(Kudos.id))
        .filter(Kudos.workout_log_id == workout_log_id)
        .group_by(Kudos.emoji)
        .all()
    )
    my = {
        r[0] for r in db.query(Kudos.emoji)
        .filter(Kudos.workout_log_id == workout_log_id, Kudos.giver_id == user_id)
        .all()
    }
    out = []
    for e in ALLOWED_EMOJI:
        c = counts.get(e, 0)
        if c > 0 or e in my:
            out.append({"emoji": e, "count": c, "reacted": e in my})
    total = sum(counts.values())
    return {"reactions": out, "total_count": total}


@router.post("/{workout_log_id}")
def toggle_kudos(
    workout_log_id: int,
    payload: Optional[KudosToggle] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    emoji = (payload.emoji if payload else "clap")
    if emoji not in ALLOWED_EMOJI:
        raise HTTPException(status_code=400, detail="Invalid emoji")

    log = db.get(WorkoutLog, workout_log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Workout log not found")

    existing = db.query(Kudos).filter(
        Kudos.giver_id == current_user.id,
        Kudos.workout_log_id == workout_log_id,
        Kudos.emoji == emoji,
    ).first()

    if existing:
        db.delete(existing)
    else:
        db.add(Kudos(giver_id=current_user.id, workout_log_id=workout_log_id, emoji=emoji))
    db.commit()

    return _build_reactions(db, workout_log_id, current_user.id)
