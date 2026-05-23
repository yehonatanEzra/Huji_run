from __future__ import annotations
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..models.kudos import Kudos
from ..models.workout import WorkoutLog

router = APIRouter(prefix="/kudos", tags=["kudos"])


@router.post("/{workout_log_id}")
def toggle_kudos(
    workout_log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    log = db.get(WorkoutLog, workout_log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Workout log not found")

    existing = db.query(Kudos).filter(
        Kudos.giver_id == current_user.id,
        Kudos.workout_log_id == workout_log_id,
    ).first()

    if existing:
        db.delete(existing)
    else:
        db.add(Kudos(giver_id=current_user.id, workout_log_id=workout_log_id))
    db.commit()

    count = db.query(sa_func.count(Kudos.id)).filter(
        Kudos.workout_log_id == workout_log_id,
    ).scalar()

    has_kudos = db.query(Kudos).filter(
        Kudos.giver_id == current_user.id,
        Kudos.workout_log_id == workout_log_id,
    ).first() is not None

    return {"kudos_count": count, "has_kudos": has_kudos}
