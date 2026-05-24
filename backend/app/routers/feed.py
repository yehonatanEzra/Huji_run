from __future__ import annotations
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func, desc
from ..database import get_db
from ..dependencies import get_current_user, require_coach
from ..models.user import User
from ..models.feed import Announcement, AnnouncementReaction, AnnouncementComment
from ..schemas.feed import AnnouncementCreate, AnnouncementOut, ReactionSummary, ReactionToggle, CommentOut, CommentCreate

router = APIRouter(prefix="/feed", tags=["feed"])

ALLOWED_EMOJI = {"thumbsup", "fire", "muscle"}


def _build_announcement_out(ann: Announcement, user_id: int, db: Session) -> AnnouncementOut:
    counts = (
        db.query(AnnouncementReaction.emoji, sa_func.count(AnnouncementReaction.id))
        .filter(AnnouncementReaction.announcement_id == ann.id)
        .group_by(AnnouncementReaction.emoji)
        .all()
    )
    my_reactions = {
        r[0] for r in db.query(AnnouncementReaction.emoji)
        .filter(AnnouncementReaction.announcement_id == ann.id, AnnouncementReaction.user_id == user_id)
        .all()
    }
    reactions = []
    for emoji in ALLOWED_EMOJI:
        count = dict(counts).get(emoji, 0)
        if count > 0 or emoji in my_reactions:
            reactions.append(ReactionSummary(emoji=emoji, count=count, reacted=emoji in my_reactions))

    comment_rows = (
        db.query(AnnouncementComment)
        .filter(AnnouncementComment.announcement_id == ann.id)
        .order_by(AnnouncementComment.created_at.asc())
        .all()
    )
    comments = [
        CommentOut(
            id=c.id,
            user_name=c.user.full_name,
            user_id=c.user_id,
            user_role=c.user.role,
            photo_url=f"/api/v1/profile/photo/{c.user_id}" if c.user.photo_filename else None,
            body=c.body,
            created_at=c.created_at,
        )
        for c in comment_rows
    ]

    author_photo = f"/api/v1/profile/photo/{ann.author_id}" if ann.author.photo_filename else None

    return AnnouncementOut(
        id=ann.id,
        title=ann.title,
        body=ann.body,
        author_name=ann.author.full_name,
        author_role=ann.author.role,
        author_photo_url=author_photo,
        training_group_id=ann.training_group_id,
        created_at=ann.created_at,
        reactions=reactions,
        comments=comments,
        comment_count=len(comments),
    )


@router.get("", response_model=List[AnnouncementOut])
def get_feed(
    before_id: Optional[int] = Query(default=None),
    limit: int = Query(default=20, le=50),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    q = db.query(Announcement)
    if current_user.role != "coach":
        q = q.filter(
            (Announcement.training_group_id == None) |
            (Announcement.training_group_id == current_user.training_group_id)
        )
    if before_id:
        q = q.filter(Announcement.id < before_id)
    announcements = q.order_by(desc(Announcement.id)).limit(limit).all()
    return [_build_announcement_out(a, current_user.id, db) for a in announcements]


@router.post("", response_model=AnnouncementOut, status_code=201)
def create_announcement(
    body: AnnouncementCreate,
    coach: User = Depends(require_coach),
    db: Session = Depends(get_db),
):
    ann = Announcement(
        title=body.title,
        body=body.body,
        author_id=coach.id,
        training_group_id=body.training_group_id,
    )
    db.add(ann)
    db.commit()
    db.refresh(ann)
    return _build_announcement_out(ann, coach.id, db)


@router.delete("/{announcement_id}", status_code=204)
def delete_announcement(
    announcement_id: int,
    coach: User = Depends(require_coach),
    db: Session = Depends(get_db),
):
    ann = db.get(Announcement, announcement_id)
    if not ann:
        raise HTTPException(status_code=404, detail="Not found")
    if ann.author_id != coach.id:
        raise HTTPException(status_code=403, detail="Only the author can delete")
    db.delete(ann)
    db.commit()


@router.post("/{announcement_id}/react")
def toggle_reaction(
    announcement_id: int,
    body: ReactionToggle,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if body.emoji not in ALLOWED_EMOJI:
        raise HTTPException(status_code=400, detail=f"Allowed emoji: {', '.join(ALLOWED_EMOJI)}")
    ann = db.get(Announcement, announcement_id)
    if not ann:
        raise HTTPException(status_code=404, detail="Not found")

    existing = db.query(AnnouncementReaction).filter(
        AnnouncementReaction.announcement_id == announcement_id,
        AnnouncementReaction.user_id == current_user.id,
        AnnouncementReaction.emoji == body.emoji,
    ).first()

    if existing:
        db.delete(existing)
    else:
        db.add(AnnouncementReaction(
            announcement_id=announcement_id,
            user_id=current_user.id,
            emoji=body.emoji,
        ))
    db.commit()

    count = db.query(sa_func.count(AnnouncementReaction.id)).filter(
        AnnouncementReaction.announcement_id == announcement_id,
        AnnouncementReaction.emoji == body.emoji,
    ).scalar()
    return {"emoji": body.emoji, "count": count, "reacted": existing is None}


@router.post("/{announcement_id}/comment", response_model=CommentOut, status_code=201)
def add_comment(
    announcement_id: int,
    body: CommentCreate,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ann = db.get(Announcement, announcement_id)
    if not ann:
        raise HTTPException(status_code=404, detail="Not found")
    if not body.body.strip():
        raise HTTPException(status_code=400, detail="Comment cannot be empty")
    comment = AnnouncementComment(
        announcement_id=announcement_id,
        user_id=current_user.id,
        body=body.body.strip(),
    )
    db.add(comment)
    db.commit()
    db.refresh(comment)
    return CommentOut(
        id=comment.id,
        user_name=current_user.full_name,
        user_id=current_user.id,
        user_role=current_user.role,
        photo_url=f"/api/v1/profile/photo/{current_user.id}" if current_user.photo_filename else None,
        body=comment.body,
        created_at=comment.created_at,
    )


@router.delete("/{announcement_id}/comment/{comment_id}", status_code=204)
def delete_comment(
    announcement_id: int,
    comment_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    comment = db.query(AnnouncementComment).filter(
        AnnouncementComment.id == comment_id,
        AnnouncementComment.announcement_id == announcement_id,
    ).first()
    if not comment:
        raise HTTPException(status_code=404, detail="Not found")
    if comment.user_id != current_user.id and current_user.role != "coach":
        raise HTTPException(status_code=403, detail="Not allowed")
    db.delete(comment)
    db.commit()
