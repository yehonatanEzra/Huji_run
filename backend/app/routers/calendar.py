from datetime import date, timedelta
from typing import Annotated
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user, require_coach
from ..models.user import User
from ..models.workout import GroupWorkout, IndividualTarget, WorkoutLog
from ..schemas.workout import (
    GroupWorkoutUpsert, GroupWorkoutOut,
    IndividualTargetUpsert, IndividualTargetOut,
    WorkoutLogUpsert, WorkoutLogOut,
    DayData, WeekResponse,
)

router = APIRouter(prefix="/calendar", tags=["calendar"])


def _week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _build_week(athlete: User, week_start: date, db: Session) -> WeekResponse:
    days = []
    for i in range(7):
        day = week_start + timedelta(days=i)
        gw = db.query(GroupWorkout).filter(GroupWorkout.date == day).first()
        it = db.query(IndividualTarget).filter(
            IndividualTarget.athlete_id == athlete.id,
            IndividualTarget.date == day,
        ).first()
        log = db.query(WorkoutLog).filter(
            WorkoutLog.athlete_id == athlete.id,
            WorkoutLog.date == day,
        ).first()
        days.append(DayData(
            date=day,
            group_workout=GroupWorkoutOut.model_validate(gw) if gw else None,
            individual_target=IndividualTargetOut.model_validate(it) if it else None,
            workout_log=WorkoutLogOut.model_validate(log) if log else None,
        ))
    return WeekResponse(week_start=week_start, days=days)


# ── Athlete endpoints ─────────────────────────────────────────────────────────

@router.get("/week", response_model=WeekResponse)
def get_week(
    day: date = Query(default_factory=date.today),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _build_week(current_user, _week_start(day), db)


@router.post("/log", response_model=WorkoutLogOut)
def submit_log(
    body: WorkoutLogUpsert,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    log = db.query(WorkoutLog).filter(
        WorkoutLog.athlete_id == current_user.id,
        WorkoutLog.date == body.date,
    ).first()
    if log:
        log.completed = body.completed
        log.notes = body.notes
    else:
        log = WorkoutLog(
            athlete_id=current_user.id,
            date=body.date,
            completed=body.completed,
            notes=body.notes,
        )
        db.add(log)
    db.commit()
    db.refresh(log)
    return log


# ── Coach endpoints ───────────────────────────────────────────────────────────

@router.put("/group/{day}", response_model=GroupWorkoutOut)
def upsert_group_workout(
    day: date,
    body: GroupWorkoutUpsert,
    coach: User = Depends(require_coach),
    db: Session = Depends(get_db),
):
    gw = db.query(GroupWorkout).filter(GroupWorkout.date == day).first()
    if gw:
        gw.content = body.content
    else:
        gw = GroupWorkout(date=day, content=body.content, created_by=coach.id)
        db.add(gw)
    db.commit()
    db.refresh(gw)
    return gw


@router.delete("/group/{day}", status_code=204)
def delete_group_workout(
    day: date,
    _: User = Depends(require_coach),
    db: Session = Depends(get_db),
):
    gw = db.query(GroupWorkout).filter(GroupWorkout.date == day).first()
    if gw:
        db.delete(gw)
        db.commit()


@router.put("/targets/{athlete_id}/{day}", response_model=IndividualTargetOut)
def upsert_individual_target(
    athlete_id: int,
    day: date,
    body: IndividualTargetUpsert,
    coach: User = Depends(require_coach),
    db: Session = Depends(get_db),
):
    it = db.query(IndividualTarget).filter(
        IndividualTarget.athlete_id == athlete_id,
        IndividualTarget.date == day,
    ).first()
    if it:
        it.note = body.note
    else:
        it = IndividualTarget(
            athlete_id=athlete_id,
            date=day,
            note=body.note,
            created_by=coach.id,
        )
        db.add(it)
    db.commit()
    db.refresh(it)
    return it


@router.delete("/targets/{athlete_id}/{day}", status_code=204)
def delete_individual_target(
    athlete_id: int,
    day: date,
    _: User = Depends(require_coach),
    db: Session = Depends(get_db),
):
    it = db.query(IndividualTarget).filter(
        IndividualTarget.athlete_id == athlete_id,
        IndividualTarget.date == day,
    ).first()
    if it:
        db.delete(it)
        db.commit()
