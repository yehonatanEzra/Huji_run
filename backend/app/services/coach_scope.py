"""Shared coach/admin group-visibility scoping used by reporting + analytics."""
from typing import Optional
from sqlalchemy.orm import Session
from ..models.user import User
from ..models.training_group import TrainingGroup
from ..models.group_coach import GroupCoach


def coach_groups_with_role(coach: User, db: Session, active_team_id: Optional[int]) -> dict[int, str]:
    """Map of group_id -> 'main' | 'assistant' for the groups this coach may act
    on. Admins get every team group as 'main'. This is the single source of truth
    for a coach's role within a group; `visible_group_ids` is derived from it."""
    if coach.role == "admin":
        q = db.query(TrainingGroup.id)
        if active_team_id:
            q = q.filter(TrainingGroup.team_id == active_team_id)
        return {row[0]: "main" for row in q.all()}
    return {
        gid: role
        for gid, role in db.query(GroupCoach.group_id, GroupCoach.role)
        .filter(GroupCoach.user_id == coach.id).all()
    }


def visible_group_ids(coach: User, db: Session, active_team_id: Optional[int]) -> set[int]:
    """Groups this coach can report on: all team groups for admins, else the
    groups they are a GroupCoach of."""
    return set(coach_groups_with_role(coach, db, active_team_id).keys())


def can_coach_target_athlete(coach: User, athlete: Optional[User], db: Session) -> bool:
    """True if `coach` may view/author an athlete's individual workouts: admins,
    the athlete's personal coach, or ANY coach (main or assistant) of the
    athlete's training group. Lets group coaches program for athletes they share
    a group with, not just their own roster."""
    if athlete is None or athlete.role != "athlete":
        return False
    if coach.role == "admin":
        return True
    if athlete.coach_id == coach.id:
        return True
    if athlete.training_group_id is None:
        return False
    return db.query(GroupCoach).filter(
        GroupCoach.group_id == athlete.training_group_id,
        GroupCoach.user_id == coach.id,
    ).first() is not None
