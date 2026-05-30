from datetime import date, timedelta
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user, require_coach
from ..models.user import User
from sqlalchemy import func as sa_func
from ..models.workout import GroupWorkout, GroupWorkoutRecipient, IndividualTarget, WorkoutLog, WorkoutLogComment
from ..models.kudos import Kudos
from ..schemas.workout import (
    GroupWorkoutUpsert, GroupWorkoutOut,
    IndividualTargetUpsert, IndividualTargetOut,
    WorkoutLogUpsert, WorkoutLogOut,
    DayData, WeekResponse,
)

router = APIRouter(prefix="/calendar", tags=["calendar"])


def _week_start(d: date) -> date:
    return d - timedelta(days=(d.weekday() + 1) % 7)


def _pick_workout_for_athlete(
    db: Session, group_id: int, day: date, athlete_id: int, *, is_coach_view: bool
):
    """Among all group workouts on (group_id, day), pick the one that applies
    to this athlete. Rules:
      - A workout with NO recipients is broadcast → applies to everyone.
      - A workout with explicit recipients applies only to those athletes.
      - When multiple workouts apply, the newest (highest id) wins.
    For coach views (`is_coach_view=True`) the recipient filter is bypassed —
    coaches just get the newest workout for the day."""
    workouts = (
        db.query(GroupWorkout)
        .filter(GroupWorkout.training_group_id == group_id, GroupWorkout.date == day)
        .order_by(GroupWorkout.id.desc())
        .all()
    )
    if not workouts:
        return None
    if is_coach_view:
        return workouts[0]
    wids = [w.id for w in workouts]
    recips: dict[int, set[int]] = {wid: set() for wid in wids}
    for wid, aid in db.query(
        GroupWorkoutRecipient.group_workout_id, GroupWorkoutRecipient.athlete_id
    ).filter(GroupWorkoutRecipient.group_workout_id.in_(wids)).all():
        recips[wid].add(aid)
    for w in workouts:  # already sorted newest-first
        rec = recips[w.id]
        if not rec or athlete_id in rec:
            return w
    return None


def _build_week(athlete: User, week_start: date, db: Session, is_coach: bool = False, group_id: Optional[int] = None, viewer_id: Optional[int] = None) -> WeekResponse:
    gid = group_id or athlete.training_group_id
    days = []
    logs = []
    for i in range(7):
        day = week_start + timedelta(days=i)
        gw = None
        if gid:
            gw = _pick_workout_for_athlete(db, gid, day, athlete.id, is_coach_view=is_coach)
            if gw and not is_coach:
                has_published = bool(gw.content or gw.warmup or gw.main_session or gw.cooldown or gw.title)
                if not has_published:
                    gw = None
                else:
                    gw.draft_content = None
        it = db.query(IndividualTarget).filter(
            IndividualTarget.athlete_id == athlete.id,
            IndividualTarget.date == day,
        ).first()
        log = db.query(WorkoutLog).filter(
            WorkoutLog.athlete_id == athlete.id,
            WorkoutLog.date == day,
        ).first()
        if not is_coach and it and it.override_group:
            gw = None
        if log:
            logs.append(log)
        gw_out = None
        if gw:
            gw_out = GroupWorkoutOut.model_validate(gw)
            gw_recipient_ids = [
                r[0] for r in db.query(GroupWorkoutRecipient.athlete_id)
                .filter(GroupWorkoutRecipient.group_workout_id == gw.id).all()
            ]
            gw_out = gw_out.model_copy(update={"recipient_ids": gw_recipient_ids})
        days.append(DayData(
            date=day,
            group_workout=gw_out,
            individual_target=IndividualTargetOut.model_validate(it) if it else None,
            workout_log=WorkoutLogOut.model_validate(log) if log else None,
        ))

    if logs:
        log_ids = [l.id for l in logs]
        counts = dict(
            db.query(Kudos.workout_log_id, sa_func.count(Kudos.id))
            .filter(Kudos.workout_log_id.in_(log_ids))
            .group_by(Kudos.workout_log_id)
            .all()
        )
        comment_counts = dict(
            db.query(WorkoutLogComment.workout_log_id, sa_func.count(WorkoutLogComment.id))
            .filter(WorkoutLogComment.workout_log_id.in_(log_ids))
            .group_by(WorkoutLogComment.workout_log_id)
            .all()
        )
        viewer = viewer_id or (athlete.id if not is_coach else None)
        my_kudos = set()
        if viewer:
            my_kudos = {
                r[0] for r in db.query(Kudos.workout_log_id)
                .filter(Kudos.workout_log_id.in_(log_ids), Kudos.giver_id == viewer)
                .all()
            }
        for day_data in days:
            if day_data.workout_log:
                day_data.workout_log.kudos_count = counts.get(day_data.workout_log.id, 0)
                day_data.workout_log.has_kudos = day_data.workout_log.id in my_kudos
                day_data.workout_log.comment_count = comment_counts.get(day_data.workout_log.id, 0)

    return WeekResponse(week_start=week_start, days=days)


# ── Athlete endpoints ─────────────────────────────────────────────────────────

@router.get("/week", response_model=WeekResponse)
def get_week(
    day: date = Query(default_factory=date.today),
    group_id: Optional[int] = Query(default=None),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    return _build_week(
        current_user, _week_start(day), db,
        is_coach=current_user.role == "coach",
        group_id=group_id,
        viewer_id=current_user.id,
    )


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
        log.status = body.status
        log.completed = body.status == "completed"
        log.distance_km = body.distance_km
        log.notes = body.notes
    else:
        log = WorkoutLog(
            athlete_id=current_user.id,
            date=body.date,
            status=body.status,
            completed=body.status == "completed",
            distance_km=body.distance_km,
            notes=body.notes,
        )
        db.add(log)
    db.commit()
    db.refresh(log)
    return log


# ── Coach endpoints ───────────────────────────────────────────────────────────

ALLOWED_TYPES = {"simple", "easy", "tempo", "long", "intervals", "fartlek", "race", "rest"}


def _clean(s):
    if s is None:
        return None
    s = s.strip()
    return s if s else None


def _serialize_gw(db: Session, gw: GroupWorkout) -> GroupWorkoutOut:
    rids = [
        r.athlete_id for r in db.query(GroupWorkoutRecipient)
        .filter(GroupWorkoutRecipient.group_workout_id == gw.id).all()
    ]
    return GroupWorkoutOut.model_validate(gw).model_copy(update={"recipient_ids": rids})


def _apply_workout_fields(gw: GroupWorkout, body: GroupWorkoutUpsert):
    if body.workout_type is not None and body.workout_type in ALLOWED_TYPES:
        gw.workout_type = body.workout_type
    if body.title is not None:
        gw.title = _clean(body.title)
    if body.content is not None:
        gw.content = _clean(body.content)
    if body.warmup is not None:
        gw.warmup = _clean(body.warmup)
    if body.main_session is not None:
        gw.main_session = _clean(body.main_session)
    if body.cooldown is not None:
        gw.cooldown = _clean(body.cooldown)
    if body.draft_content is not None:
        gw.draft_content = _clean(body.draft_content)


def _replace_recipients(db: Session, gw_id: int, recipient_ids):
    """None = leave untouched. [] = broadcast (clear table). list = replace."""
    if recipient_ids is None:
        return
    db.query(GroupWorkoutRecipient).filter(GroupWorkoutRecipient.group_workout_id == gw_id).delete()
    for aid in set(recipient_ids):
        db.add(GroupWorkoutRecipient(group_workout_id=gw_id, athlete_id=aid))


@router.get("/coach/group/{group_id}")
def coach_group_week(
    group_id: int,
    day: date = Query(default_factory=date.today),
    _: User = Depends(require_coach),
    db: Session = Depends(get_db),
):
    """Return all workouts the coach has authored for `group_id` across the
    Sun→Sat week containing `day`. Shape:
        {"week_start": date, "days": [{"date": str, "group_workouts": [...]}]}"""
    ws = _week_start(day)
    days_out = []
    for i in range(7):
        d = ws + timedelta(days=i)
        rows = (
            db.query(GroupWorkout)
            .filter(GroupWorkout.training_group_id == group_id, GroupWorkout.date == d)
            .order_by(GroupWorkout.id.asc())
            .all()
        )
        days_out.append({
            "date": d.isoformat(),
            "group_workouts": [_serialize_gw(db, gw).model_dump() for gw in rows],
        })
    return {"week_start": ws.isoformat(), "days": days_out}


@router.post("/group/{group_id}/{day}", response_model=GroupWorkoutOut, status_code=201)
def create_group_workout(
    group_id: int,
    day: date,
    body: GroupWorkoutUpsert,
    coach: User = Depends(require_coach),
    db: Session = Depends(get_db),
):
    """Create a new group workout. Multiple may exist per (group, date)."""
    wt = body.workout_type if body.workout_type in ALLOWED_TYPES else "simple"
    gw = GroupWorkout(
        training_group_id=group_id,
        date=day,
        workout_type=wt,
        title=_clean(body.title),
        content=_clean(body.content),
        warmup=_clean(body.warmup),
        main_session=_clean(body.main_session),
        cooldown=_clean(body.cooldown),
        draft_content=_clean(body.draft_content),
        created_by=coach.id,
    )
    db.add(gw)
    db.flush()
    _replace_recipients(db, gw.id, body.recipient_ids)
    db.commit()
    db.refresh(gw)
    return _serialize_gw(db, gw)


@router.put("/group-workouts/{workout_id}", response_model=GroupWorkoutOut)
def edit_group_workout(
    workout_id: int,
    body: GroupWorkoutUpsert,
    _: User = Depends(require_coach),
    db: Session = Depends(get_db),
):
    """Edit one specific group workout by ID."""
    gw = db.get(GroupWorkout, workout_id)
    if not gw:
        raise HTTPException(status_code=404, detail="Group workout not found")
    _apply_workout_fields(gw, body)
    _replace_recipients(db, gw.id, body.recipient_ids)
    db.commit()
    db.refresh(gw)
    return _serialize_gw(db, gw)


@router.delete("/group-workouts/{workout_id}", status_code=204)
def delete_group_workout_by_id(
    workout_id: int,
    _: User = Depends(require_coach),
    db: Session = Depends(get_db),
):
    gw = db.get(GroupWorkout, workout_id)
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
    ALLOWED_TYPES = {"simple", "easy", "tempo", "long", "intervals", "fartlek", "race", "rest"}

    def _clean(s):
        if s is None:
            return None
        s = s.strip()
        return s if s else None

    it = db.query(IndividualTarget).filter(
        IndividualTarget.athlete_id == athlete_id,
        IndividualTarget.date == day,
    ).first()
    if it:
        it.note = body.note or ""
        it.override_group = body.override_group
        if body.workout_type is not None and body.workout_type in ALLOWED_TYPES:
            it.workout_type = body.workout_type
        if body.title is not None:
            it.title = _clean(body.title)
        if body.warmup is not None:
            it.warmup = _clean(body.warmup)
        if body.main_session is not None:
            it.main_session = _clean(body.main_session)
        if body.cooldown is not None:
            it.cooldown = _clean(body.cooldown)
    else:
        wt = body.workout_type if (body.workout_type in ALLOWED_TYPES) else "simple"
        it = IndividualTarget(
            athlete_id=athlete_id,
            date=day,
            note=body.note or "",
            override_group=body.override_group,
            workout_type=wt,
            title=_clean(body.title),
            warmup=_clean(body.warmup),
            main_session=_clean(body.main_session),
            cooldown=_clean(body.cooldown),
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
