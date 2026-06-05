"""Shared service for admin user-management actions: rename, role-change,
delete with cascade. Used by `routers/admin_users.py`.

The delete cascade body used to live inline in `routers/coach.py::
delete_athlete`. It moved here so it can also handle coach/admin
deletions (which need the same per-user data cleanup plus a couple
of extra reassignments that only matter when the deleted user owned
athletes or training groups).
"""
from __future__ import annotations
from typing import Iterable
from fastapi import HTTPException, status
from sqlalchemy.orm import Session

from ..models.user import User
from ..models.training_group import TrainingGroup
from ..models.workout import WorkoutLog, IndividualTarget
from ..models.race import Race, Heat, Result, RaceRegistration
from ..models.kudos import Kudos
from ..models.feed import Announcement, AnnouncementReaction, AnnouncementComment
from ..models.hall_of_fame import HallOfFame
from ..models.health_wellness import HealthProfessional, HealthReview
from ..services.hall_of_fame import refresh_hall_of_fame


ALLOWED_ROLES = ("athlete", "coach", "admin")


def rename_user(db: Session, target: User, full_name: str) -> User:
    name = (full_name or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty")
    if len(name) > 150:
        raise HTTPException(status_code=400, detail="Name too long (max 150)")
    target.full_name = name
    db.commit()
    db.refresh(target)
    return target


def _orphan_roster_and_groups(db: Session, target_id: int) -> None:
    """Detach any athletes/training-groups still pointing at this user as
    their coach. Leaves the athletes/groups intact — the admin can
    reassign them from the Users page."""
    db.query(User).filter(User.coach_id == target_id).update(
        {User.coach_id: None}, synchronize_session=False
    )
    db.query(TrainingGroup).filter(TrainingGroup.coach_id == target_id).update(
        {TrainingGroup.coach_id: None}, synchronize_session=False
    )


def change_user_role(db: Session, target: User, new_role: str) -> User:
    if new_role not in ALLOWED_ROLES:
        raise HTTPException(status_code=400, detail="Invalid role")
    if target.role == new_role:
        return target

    # Last-admin safety: an admin demotion is only OK if at least one
    # other admin remains afterwards.
    if target.role == "admin" and new_role != "admin":
        other_admins = (
            db.query(User)
            .filter(User.role == "admin", User.id != target.id)
            .count()
        )
        if other_admins == 0:
            raise HTTPException(status_code=400, detail="Cannot demote the last admin")

    # Demoting away from coach (or admin) frees any athletes / groups that
    # were pointing at this user as their coach.
    if target.role in ("coach", "admin") and new_role == "athlete":
        _orphan_roster_and_groups(db, target.id)

    # Promoting an athlete out of athlete status: they're no longer
    # someone's athlete, so clear the back-pointer.
    if target.role == "athlete" and new_role in ("coach", "admin"):
        target.coach_id = None
        target.training_group_id = None

    target.role = new_role
    db.commit()
    db.refresh(target)
    return target


def _purge_user_owned_data(db: Session, user_id: int, deleter_id: int) -> Iterable[tuple[int, str]]:
    """Wipe every per-user row that belongs to this user. Returns the
    set of (distance_m, gender) HoF buckets that need refreshing after
    the surrounding commit."""
    workout_log_ids = [
        l.id for l in db.query(WorkoutLog.id).filter(WorkoutLog.athlete_id == user_id).all()
    ]
    if workout_log_ids:
        db.query(Kudos).filter(Kudos.workout_log_id.in_(workout_log_ids)).delete(synchronize_session=False)
    db.query(WorkoutLog).filter(WorkoutLog.athlete_id == user_id).delete()
    db.query(IndividualTarget).filter(IndividualTarget.athlete_id == user_id).delete()

    db.query(Kudos).filter(Kudos.giver_id == user_id).delete()

    db.query(AnnouncementReaction).filter(AnnouncementReaction.user_id == user_id).delete()
    db.query(AnnouncementComment).filter(AnnouncementComment.user_id == user_id).delete()
    for ann in db.query(Announcement).filter(Announcement.author_id == user_id).all():
        db.query(AnnouncementReaction).filter(AnnouncementReaction.announcement_id == ann.id).delete()
        db.query(AnnouncementComment).filter(AnnouncementComment.announcement_id == ann.id).delete()
        db.delete(ann)

    db.query(RaceRegistration).filter(RaceRegistration.user_id == user_id).delete()
    db.query(RaceRegistration).filter(RaceRegistration.registered_by == user_id).delete()

    db.query(HealthReview).filter(HealthReview.user_id == user_id).delete()
    db.query(HealthProfessional).filter(HealthProfessional.created_by_id == user_id).update(
        {HealthProfessional.created_by_id: deleter_id}, synchronize_session=False
    )

    hof_refresh: set[tuple[int, str]] = set()
    user_results = db.query(Result).filter(Result.user_id == user_id).all()
    for r in user_results:
        heat = db.get(Heat, r.heat_id)
        if heat:
            hof_refresh.add((heat.distance_m, r.gender))
        db.delete(r)
    db.query(HallOfFame).filter(HallOfFame.user_id == user_id).delete()
    return hof_refresh


def cascade_delete_user(db: Session, target: User, actor: User) -> None:
    if target.id == actor.id:
        raise HTTPException(status_code=400, detail="Cannot delete yourself")
    if target.role == "admin":
        other_admins = (
            db.query(User)
            .filter(User.role == "admin", User.id != target.id)
            .count()
        )
        if other_admins == 0:
            raise HTTPException(status_code=400, detail="Cannot delete the last admin")

    # Coaches/admins may own athletes or training groups via FK back-refs.
    # Null those out so the surviving rows remain valid after the delete.
    if target.role in ("coach", "admin"):
        _orphan_roster_and_groups(db, target.id)

    hof_refresh = _purge_user_owned_data(db, target.id, actor.id)

    db.delete(target)
    db.commit()
    for distance_m, gender in hof_refresh:
        refresh_hall_of_fame(db, distance_m, gender)
