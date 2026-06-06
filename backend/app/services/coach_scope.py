"""Shared coach/admin group-visibility scoping used by reporting + analytics."""
from typing import Optional
from sqlalchemy.orm import Session
from ..models.user import User
from ..models.training_group import TrainingGroup
from ..models.group_coach import GroupCoach


def visible_group_ids(coach: User, db: Session, active_team_id: Optional[int]) -> set[int]:
    """Groups this coach can report on: all team groups for admins, else the
    groups they are a GroupCoach of."""
    if coach.role == "admin":
        q = db.query(TrainingGroup.id)
        if active_team_id:
            q = q.filter(TrainingGroup.team_id == active_team_id)
        return {row[0] for row in q.all()}
    return {
        row[0] for row in db.query(GroupCoach.group_id)
        .filter(GroupCoach.user_id == coach.id).all()
    }
