from __future__ import annotations
from datetime import date, timedelta
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user, get_active_team_id
from ..models.user import User
from ..models.goal import Goal
from ..models.workout import WorkoutLog
from ..models.race import Result, Heat, Race, CANONICAL_DISTANCES
from ..schemas.goal import GoalCreate, GoalOut
from ..services.coach_scope import can_coach_target_athlete
from ..services.time_utils import seconds_to_display
from .races import _can_see_race

router = APIRouter(prefix="/goals", tags=["goals"])


# Sunday-start week, same convention as stats.py / leaderboard.
def _week_start(d: date) -> date:
    return d - timedelta(days=(d.weekday() + 1) % 7)


def _can_view(viewer: User, athlete: Optional[User], db: Session) -> bool:
    if athlete is None:
        return False
    if viewer.id == athlete.id or viewer.role == "admin":
        return True
    return viewer.role in ("coach", "admin") and can_coach_target_athlete(viewer, athlete, db)


def _to_out(goal: Goal, db: Session) -> GoalOut:
    out = GoalOut.model_validate(goal)
    if goal.goal_type == "volume":
        ws = _week_start(date.today())
        current = db.query(func.coalesce(func.sum(WorkoutLog.distance_km), 0.0)).filter(
            WorkoutLog.athlete_id == goal.athlete_id,
            WorkoutLog.date >= ws,
            WorkoutLog.date <= ws + timedelta(days=6),
        ).scalar() or 0.0
        current = float(current)
        target = goal.target_km or 0.0
        out.current_value = round(current, 1)
        out.progress_pct = min(100.0, round(current / target * 100, 1)) if target > 0 else 0.0
        out.achieved = target > 0 and current >= target
        out.target_display = f"{target:g} km/wk"
        out.current_display = f"{current:.1f} km"
    else:  # pb or race — best approved time at the distance (race goal scopes to one race)
        q = db.query(func.min(Result.time_seconds)).join(Heat, Result.heat_id == Heat.id).filter(
            Result.user_id == goal.athlete_id,
            Heat.distance_m == goal.distance_m,
        )
        if goal.goal_type == "race":
            q = q.filter(Heat.race_id == goal.race_id)
            race = db.get(Race, goal.race_id) if goal.race_id else None
            if race is not None:
                out.race_name = race.name
                out.race_date = race.race_date.isoformat() if race.race_date else None
        best = q.scalar()
        target = goal.target_seconds or 0
        out.current_value = float(best) if best is not None else None
        if best is None or target <= 0:
            out.progress_pct = 0.0
            out.achieved = False
        elif best <= target:
            out.progress_pct = 100.0
            out.achieved = True
        else:
            out.progress_pct = min(99.0, round(target / best * 100, 1))
            out.achieved = False
        out.target_display = seconds_to_display(target) if target > 0 else None
        out.current_display = seconds_to_display(int(best)) if best is not None else "—"
    return out


@router.get("/{athlete_id}", response_model=list[GoalOut])
def list_goals(
    athlete_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    athlete = db.get(User, athlete_id)
    if not _can_view(current_user, athlete, db):
        raise HTTPException(status_code=404, detail="Athlete not found")
    goals = (
        db.query(Goal)
        .filter(Goal.athlete_id == athlete_id, Goal.status == "active")
        .order_by(Goal.created_at.desc())
        .all()
    )
    return [_to_out(g, db) for g in goals]


@router.post("", response_model=GoalOut, status_code=201)
def create_goal(
    body: GoalCreate,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
    active_team_id: Annotated[Optional[int], Depends(get_active_team_id)] = None,
):
    athlete = db.get(User, body.athlete_id)
    if athlete is None or athlete.role != "athlete":
        raise HTTPException(status_code=404, detail="Athlete not found")

    # Athlete sets their own goal, or a coach sets one for an athlete they coach.
    is_self = current_user.id == athlete.id
    is_coach = current_user.role in ("coach", "admin") and can_coach_target_athlete(current_user, athlete, db)
    if not (is_self or is_coach):
        raise HTTPException(status_code=403, detail="Not allowed to set goals for this athlete")

    race_id = None
    if body.goal_type == "volume":
        if not body.target_km or body.target_km <= 0:
            raise HTTPException(status_code=422, detail="Volume goal needs a positive target_km")
        distance_m = target_seconds = None
        target_km = float(body.target_km)
    elif body.goal_type == "pb":
        if body.distance_m not in CANONICAL_DISTANCES:
            raise HTTPException(status_code=422, detail="PB goal needs a valid distance_m")
        if not body.target_seconds or body.target_seconds <= 0:
            raise HTTPException(status_code=422, detail="PB goal needs a positive target_seconds")
        distance_m = int(body.distance_m)
        target_seconds = int(body.target_seconds)
        target_km = None
    elif body.goal_type == "race":
        race = db.get(Race, body.race_id) if body.race_id else None
        if race is None or not _can_see_race(current_user, race, db):
            raise HTTPException(status_code=422, detail="Race goal needs a visible race_id")
        if body.distance_m not in CANONICAL_DISTANCES:
            raise HTTPException(status_code=422, detail="Race goal needs a valid distance_m")
        if not body.target_seconds or body.target_seconds <= 0:
            raise HTTPException(status_code=422, detail="Race goal needs a positive target_seconds")
        race_id = race.id
        distance_m = int(body.distance_m)
        target_seconds = int(body.target_seconds)
        target_km = None
    else:
        raise HTTPException(status_code=422, detail="goal_type must be 'volume', 'pb' or 'race'")

    goal = Goal(
        team_id=active_team_id,
        athlete_id=athlete.id,
        created_by_id=current_user.id,
        goal_type=body.goal_type,
        race_id=race_id,
        distance_m=distance_m,
        target_km=target_km,
        target_seconds=target_seconds,
        note=(body.note or None),
    )
    db.add(goal)
    db.commit()
    db.refresh(goal)
    return _to_out(goal, db)


@router.delete("/{goal_id}", status_code=204)
def delete_goal(
    goal_id: int,
    db: Annotated[Session, Depends(get_db)],
    current_user: Annotated[User, Depends(get_current_user)],
):
    goal = db.get(Goal, goal_id)
    if goal is None:
        raise HTTPException(status_code=404, detail="Goal not found")
    athlete = db.get(User, goal.athlete_id)
    allowed = (
        current_user.id == goal.athlete_id
        or current_user.id == goal.created_by_id
        or (current_user.role in ("coach", "admin") and can_coach_target_athlete(current_user, athlete, db))
    )
    if not allowed:
        raise HTTPException(status_code=403, detail="Not allowed to delete this goal")
    db.delete(goal)
    db.commit()
