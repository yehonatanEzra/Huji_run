from typing import Annotated, List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import update
from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..models.notification import Notification
from ..schemas.notifications import NotificationOut, UnreadCountOut

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=List[NotificationOut])
def list_notifications(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    """Return the 30 most recent notifications for the current user."""
    rows = (
        db.query(Notification)
        .filter(Notification.recipient_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(30)
        .all()
    )
    return rows


@router.get("/unread-count", response_model=UnreadCountOut)
def unread_count(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    n = (
        db.query(Notification)
        .filter(Notification.recipient_id == current_user.id, Notification.read.is_(False))
        .count()
    )
    return UnreadCountOut(unread=n)


@router.post("/{notif_id}/read")
def mark_read(
    notif_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    n = db.get(Notification, notif_id)
    if not n or n.recipient_id != current_user.id:
        raise HTTPException(status_code=404, detail="Notification not found")
    n.read = True
    db.commit()
    return {"ok": True}


@router.post("/read-all")
def mark_all_read(
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    db.execute(
        update(Notification)
        .where(Notification.recipient_id == current_user.id, Notification.read.is_(False))
        .values(read=True)
    )
    db.commit()
    return {"ok": True}
