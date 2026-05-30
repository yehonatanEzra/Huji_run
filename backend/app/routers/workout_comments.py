from __future__ import annotations
from datetime import datetime
from typing import List
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..models.workout import WorkoutLog, WorkoutLogComment

router = APIRouter(prefix="/workout-logs", tags=["workout-comments"])


class CommentCreate(BaseModel):
    body: str


class CommentOut(BaseModel):
    id: int
    workout_log_id: int
    author_id: int
    author_name: str
    author_role: str
    body: str
    created_at: datetime


def _can_access(log: WorkoutLog, user: User, db: Session) -> bool:
    """The log's athlete, that athlete's own coach, or any admin may read/post."""
    if user.role == "admin":
        return True
    if log.athlete_id == user.id:
        return True
    if user.role == "coach":
        athlete = db.get(User, log.athlete_id)
        return athlete is not None and athlete.coach_id == user.id
    return False


@router.get("/{log_id}/comments", response_model=List[CommentOut])
def list_comments(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    log = db.get(WorkoutLog, log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Workout log not found")
    if not _can_access(log, current_user, db):
        raise HTTPException(status_code=403, detail="Not allowed")

    rows = (
        db.query(WorkoutLogComment, User)
        .join(User, User.id == WorkoutLogComment.author_id)
        .filter(WorkoutLogComment.workout_log_id == log_id)
        .order_by(WorkoutLogComment.created_at.asc())
        .all()
    )
    return [
        CommentOut(
            id=c.id,
            workout_log_id=c.workout_log_id,
            author_id=c.author_id,
            author_name=u.full_name,
            author_role=u.role,
            body=c.body,
            created_at=c.created_at,
        )
        for c, u in rows
    ]


@router.post("/{log_id}/comments", response_model=CommentOut, status_code=201)
def create_comment(
    log_id: int,
    body: CommentCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    text = (body.body or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="Comment body cannot be empty")
    log = db.get(WorkoutLog, log_id)
    if not log:
        raise HTTPException(status_code=404, detail="Workout log not found")
    if not _can_access(log, current_user, db):
        raise HTTPException(status_code=403, detail="Not allowed")

    c = WorkoutLogComment(workout_log_id=log_id, author_id=current_user.id, body=text)
    db.add(c)
    db.commit()
    db.refresh(c)
    return CommentOut(
        id=c.id,
        workout_log_id=c.workout_log_id,
        author_id=c.author_id,
        author_name=current_user.full_name,
        author_role=current_user.role,
        body=c.body,
        created_at=c.created_at,
    )


@router.delete("/{log_id}/comments/{comment_id}", status_code=204)
def delete_comment(
    log_id: int,
    comment_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    c = db.get(WorkoutLogComment, comment_id)
    if not c or c.workout_log_id != log_id:
        raise HTTPException(status_code=404, detail="Comment not found")
    # Author may always delete. Beyond that, coach must own the log's athlete;
    # admin may delete any.
    if c.author_id == current_user.id or current_user.role == "admin":
        pass
    elif current_user.role == "coach":
        log = db.get(WorkoutLog, c.workout_log_id)
        if not log:
            raise HTTPException(status_code=404, detail="Comment not found")
        athlete = db.get(User, log.athlete_id)
        if not athlete or athlete.coach_id != current_user.id:
            raise HTTPException(status_code=403, detail="Not allowed")
    else:
        raise HTTPException(status_code=403, detail="Not allowed")
    db.delete(c)
    db.commit()
