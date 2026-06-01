"""Helpers used by other routers to enqueue notifications."""
from typing import Iterable, Optional
from sqlalchemy.orm import Session
from ..models.notification import Notification


def notify(db: Session, recipient_id: int, type: str, message: str, link: Optional[str] = None) -> None:
    """Insert a single notification. Caller is responsible for db.commit()."""
    db.add(Notification(
        recipient_id=recipient_id,
        type=type,
        message=message[:255],
        link=link,
    ))


def notify_many(db: Session, recipient_ids: Iterable[int], type: str, message: str, link: Optional[str] = None) -> None:
    """Bulk-insert notifications for many recipients (same payload)."""
    seen = set()
    for rid in recipient_ids:
        if rid in seen or rid is None:
            continue
        seen.add(rid)
        db.add(Notification(
            recipient_id=rid,
            type=type,
            message=message[:255],
            link=link,
        ))
