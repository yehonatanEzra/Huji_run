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
from ..models.training_group import TrainingGroup
from ..models.group_coach import GroupCoach
from ..services.coach_scope import can_coach_target_athlete
from ..services.notifications import notify, notify_many
from ..services.prescribed_workouts import backfill_missed


def _coach_owns_group(coach: User, db: Session, group_id: int) -> bool:
    """True if `coach` may act on `group_id` — any coach of the group (main OR
    assistant) via GroupCoach, not just the legacy owner. Admin sees all."""
    g = db.get(TrainingGroup, group_id)
    if not g:
        return False
    if coach.role == "admin":
        return True
    return db.query(GroupCoach).filter(
        GroupCoach.group_id == group_id, GroupCoach.user_id == coach.id
    ).first() is not None


def _coach_owns_athlete(coach: User, db: Session, athlete_id: int) -> bool:
    """True if `coach` may act on this athlete. Admin sees all."""
    a = db.get(User, athlete_id)
    if not a or a.role != "athlete":
        return False
    if coach.role == "admin":
        return True
    return a.coach_id == coach.id
from ..schemas.workout import (
    GroupWorkoutUpsert, GroupWorkoutOut,
    IndividualTargetUpsert, IndividualTargetOut,
    WorkoutLogUpsert, WorkoutLogOut,
    DayData, WeekResponse,
)

router = APIRouter(prefix="/calendar", tags=["calendar"])


def _week_start(d: date) -> date:
    return d - timedelta(days=(d.weekday() + 1) % 7)


def _workouts_for_athlete(
    db: Session, group_id: int, day: date, athlete_id: int, *, is_coach_view: bool
) -> list[GroupWorkout]:
    """All group workouts on (group_id, day) that apply to this athlete, oldest
    -first (stable AM→PM order). Rules:
      - A workout with NO recipients is broadcast → applies to everyone.
      - A workout with explicit recipients applies only to those athletes.
    Coach views (`is_coach_view=True`) bypass the recipient filter and see all."""
    workouts = (
        db.query(GroupWorkout)
        .filter(GroupWorkout.training_group_id == group_id, GroupWorkout.date == day)
        .order_by(GroupWorkout.id.asc())
        .all()
    )
    if not workouts or is_coach_view:
        return workouts
    wids = [w.id for w in workouts]
    recips: dict[int, set[int]] = {wid: set() for wid in wids}
    for wid, aid in db.query(
        GroupWorkoutRecipient.group_workout_id, GroupWorkoutRecipient.athlete_id
    ).filter(GroupWorkoutRecipient.group_workout_id.in_(wids)).all():
        recips[wid].add(aid)
    return [w for w in workouts if not recips[w.id] or athlete_id in recips[w.id]]


def _build_week(athlete: User, week_start: date, db: Session, is_coach: bool = False, group_id: Optional[int] = None, viewer_id: Optional[int] = None) -> WeekResponse:
    gid = group_id or athlete.training_group_id
    # Auto-mark any prescribed-but-unreported past day in this week as missed
    # before we walk the days. Coach views don't trigger this — coaches read
    # other athletes' calendars and we don't want a side effect from that.
    if not is_coach:
        backfill_missed(db, athlete, week_start, week_start + timedelta(days=7), date.today())
    days = []
    logs = []
    for i in range(7):
        day = week_start + timedelta(days=i)
        gws = []
        if gid:
            gws = _workouts_for_athlete(db, gid, day, athlete.id, is_coach_view=is_coach)
            if not is_coach:
                # Athletes only see published group workouts; clear coach-only drafts.
                published = []
                for gw in gws:
                    if gw.content or gw.warmup or gw.main_session or gw.cooldown or gw.title:
                        gw.draft_content = None
                        published.append(gw)
                gws = published
        targets = db.query(IndividualTarget).filter(
            IndividualTarget.athlete_id == athlete.id,
            IndividualTarget.date == day,
        ).order_by(IndividualTarget.position.asc(), IndividualTarget.id.asc()).all()
        log = db.query(WorkoutLog).filter(
            WorkoutLog.athlete_id == athlete.id,
            WorkoutLog.date == day,
        ).first()
        # Hidden targets are coach-only: strip them from athlete views entirely.
        if not is_coach:
            targets = [t for t in targets if not t.hidden]
            # A personal override suppresses the group sessions for the athlete.
            if any(t.override_group for t in targets):
                gws = []
        if log:
            logs.append(log)
        gw_outs = []
        for gw in gws:
            gw_out = GroupWorkoutOut.model_validate(gw)
            gw_recipient_ids = [
                r[0] for r in db.query(GroupWorkoutRecipient.athlete_id)
                .filter(GroupWorkoutRecipient.group_workout_id == gw.id).all()
            ]
            gw_outs.append(gw_out.model_copy(update={"recipient_ids": gw_recipient_ids}))
        target_outs = [IndividualTargetOut.model_validate(t) for t in targets]
        days.append(DayData(
            date=day,
            group_workouts=gw_outs,
            individual_targets=target_outs,
            # Compat: newest group workout + first personal target (matches the
            # old single-value behavior for the not-yet-migrated calendar UI).
            group_workout=gw_outs[-1] if gw_outs else None,
            individual_target=target_outs[0] if target_outs else None,
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
        is_coach=current_user.role in ("coach", "admin"),
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
        log.manual_override = body.manual_override
        # Athlete edited an auto-marked row — it's their call now, not the
        # backfill's. Drop the flag so the UI hint goes away on next read.
        log.is_auto_marked = False
    else:
        log = WorkoutLog(
            athlete_id=current_user.id,
            date=body.date,
            status=body.status,
            completed=body.status == "completed",
            distance_km=body.distance_km,
            notes=body.notes,
            manual_override=body.manual_override,
        )
        db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.delete("/log/{day}", status_code=204)
def delete_log(
    day: date,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Athlete cancels their own report for a day (e.g. logged by mistake)."""
    log = db.query(WorkoutLog).filter(
        WorkoutLog.athlete_id == current_user.id,
        WorkoutLog.date == day,
    ).first()
    if log:
        db.delete(log)
        db.commit()


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
    if body.distance_km is not None:
        gw.distance_km = body.distance_km


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
    coach: User = Depends(require_coach),
    db: Session = Depends(get_db),
):
    """Return all workouts the coach has authored for `group_id` across the
    Sun→Sat week containing `day`. Shape:
        {"week_start": date, "days": [{"date": str, "group_workouts": [...]}]}"""
    if not _coach_owns_group(coach, db, group_id):
        raise HTTPException(status_code=404, detail="Group not found")
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
    if not _coach_owns_group(coach, db, group_id):
        raise HTTPException(status_code=404, detail="Group not found")
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
        distance_km=body.distance_km,
        created_by=coach.id,
    )
    db.add(gw)
    db.flush()
    _replace_recipients(db, gw.id, body.recipient_ids)

    # Notify athletes — either the recipient subset or every member of the group.
    if body.recipient_ids:
        athlete_ids = list(body.recipient_ids)
    else:
        athlete_ids = [
            r[0] for r in db.query(User.id)
            .filter(User.training_group_id == group_id, User.role == "athlete")
            .all()
        ]
    title = gw.title or wt.capitalize()
    notify_many(
        db, athlete_ids, "new_workout",
        f"New workout from coach: {title} ({day.strftime('%a %b %d')})",
        f"/calendar?date={day.isoformat()}",
    )

    db.commit()
    db.refresh(gw)
    return _serialize_gw(db, gw)


@router.put("/group-workouts/{workout_id}", response_model=GroupWorkoutOut)
def edit_group_workout(
    workout_id: int,
    body: GroupWorkoutUpsert,
    coach: User = Depends(require_coach),
    db: Session = Depends(get_db),
):
    """Edit one specific group workout by ID."""
    gw = db.get(GroupWorkout, workout_id)
    if not gw or not _coach_owns_group(coach, db, gw.training_group_id):
        raise HTTPException(status_code=404, detail="Group workout not found")
    _apply_workout_fields(gw, body)
    _replace_recipients(db, gw.id, body.recipient_ids)
    db.commit()
    db.refresh(gw)
    return _serialize_gw(db, gw)


@router.delete("/group-workouts/{workout_id}", status_code=204)
def delete_group_workout_by_id(
    workout_id: int,
    coach: User = Depends(require_coach),
    db: Session = Depends(get_db),
):
    gw = db.get(GroupWorkout, workout_id)
    if not gw:
        return
    if not _coach_owns_group(coach, db, gw.training_group_id):
        raise HTTPException(status_code=404, detail="Group workout not found")
    db.delete(gw)
    db.commit()


_TARGET_TYPES = {"simple", "easy", "tempo", "long", "intervals", "fartlek", "race", "rest"}


def _target_clean(s):
    if s is None:
        return None
    s = s.strip()
    return s or None


def _notify_personal(db, athlete_id: int, day: date, title: str):
    notify(
        db, athlete_id, "personal_workout",
        f"Coach assigned you a personal workout: {title} ({day.strftime('%a %b %d')})",
        f"/calendar?date={day.isoformat()}",
    )


def _write_target_fields(it: IndividualTarget, body: IndividualTargetUpsert):
    """Apply upsert body onto a target. workout_type only changes when valid."""
    it.note = body.note or ""
    it.override_group = body.override_group
    it.hidden = body.hidden
    if body.workout_type is not None and body.workout_type in _TARGET_TYPES:
        it.workout_type = body.workout_type
    if body.title is not None:
        it.title = _target_clean(body.title)
    if body.content is not None:
        it.content = _target_clean(body.content)
    if body.warmup is not None:
        it.warmup = _target_clean(body.warmup)
    if body.main_session is not None:
        it.main_session = _target_clean(body.main_session)
    if body.cooldown is not None:
        it.cooldown = _target_clean(body.cooldown)
    if body.distance_km is not None:
        it.distance_km = body.distance_km


@router.put("/targets/{athlete_id}/{day}", response_model=IndividualTargetOut)
def upsert_individual_target(
    athlete_id: int,
    day: date,
    body: IndividualTargetUpsert,
    coach: User = Depends(require_coach),
    db: Session = Depends(get_db),
):
    """Transitional single-workout upsert: edits the primary (first) target for
    the day, or creates one. New UIs use POST + by-id PUT/DELETE for multiples."""
    athlete = db.get(User, athlete_id)
    if not can_coach_target_athlete(coach, athlete, db):
        raise HTTPException(status_code=404, detail="Athlete not found")
    it = db.query(IndividualTarget).filter(
        IndividualTarget.athlete_id == athlete_id,
        IndividualTarget.date == day,
    ).order_by(IndividualTarget.position.asc(), IndividualTarget.id.asc()).first()
    if it:
        was_hidden = it.hidden
        _write_target_fields(it, body)
        if was_hidden and not body.hidden:
            _notify_personal(db, athlete_id, day, _target_clean(body.title) or it.workout_type.capitalize())
    else:
        it = IndividualTarget(athlete_id=athlete_id, date=day, note="", created_by=coach.id, position=0)
        _write_target_fields(it, body)
        if it.workout_type not in _TARGET_TYPES:
            it.workout_type = "simple"
        db.add(it)
        if not body.hidden:
            _notify_personal(db, athlete_id, day, _target_clean(body.title) or it.workout_type.capitalize())
    db.commit()
    db.refresh(it)
    return it


@router.post("/targets/{athlete_id}/{day}", response_model=IndividualTargetOut, status_code=201)
def create_individual_target(
    athlete_id: int,
    day: date,
    body: IndividualTargetUpsert,
    coach: User = Depends(require_coach),
    db: Session = Depends(get_db),
):
    """Append an additional personal workout to a day (multiple per day)."""
    athlete = db.get(User, athlete_id)
    if not can_coach_target_athlete(coach, athlete, db):
        raise HTTPException(status_code=404, detail="Athlete not found")
    count = db.query(IndividualTarget).filter(
        IndividualTarget.athlete_id == athlete_id, IndividualTarget.date == day,
    ).count()
    it = IndividualTarget(athlete_id=athlete_id, date=day, note="", created_by=coach.id, position=count)
    _write_target_fields(it, body)
    if it.workout_type not in _TARGET_TYPES:
        it.workout_type = "simple"
    db.add(it)
    if not body.hidden:
        _notify_personal(db, athlete_id, day, _target_clean(body.title) or it.workout_type.capitalize())
    db.commit()
    db.refresh(it)
    return it


@router.put("/individual-targets/{target_id}", response_model=IndividualTargetOut)
def update_individual_target(
    target_id: int,
    body: IndividualTargetUpsert,
    coach: User = Depends(require_coach),
    db: Session = Depends(get_db),
):
    it = db.get(IndividualTarget, target_id)
    if it is None:
        raise HTTPException(status_code=404, detail="Target not found")
    athlete = db.get(User, it.athlete_id)
    if not can_coach_target_athlete(coach, athlete, db):
        raise HTTPException(status_code=404, detail="Target not found")
    was_hidden = it.hidden
    _write_target_fields(it, body)
    if was_hidden and not body.hidden:
        _notify_personal(db, it.athlete_id, it.date, _target_clean(body.title) or it.workout_type.capitalize())
    db.commit()
    db.refresh(it)
    return it


@router.delete("/individual-targets/{target_id}", status_code=204)
def delete_individual_target_by_id(
    target_id: int,
    coach: User = Depends(require_coach),
    db: Session = Depends(get_db),
):
    it = db.get(IndividualTarget, target_id)
    if it is None:
        return
    athlete = db.get(User, it.athlete_id)
    if not can_coach_target_athlete(coach, athlete, db):
        raise HTTPException(status_code=404, detail="Target not found")
    db.delete(it)
    db.commit()


@router.delete("/targets/{athlete_id}/{day}", status_code=204)
def delete_individual_target(
    athlete_id: int,
    day: date,
    coach: User = Depends(require_coach),
    db: Session = Depends(get_db),
):
    """Transitional: clears the primary (first) target for the day."""
    athlete = db.get(User, athlete_id)
    if not can_coach_target_athlete(coach, athlete, db):
        raise HTTPException(status_code=404, detail="Athlete not found")
    it = db.query(IndividualTarget).filter(
        IndividualTarget.athlete_id == athlete_id,
        IndividualTarget.date == day,
    ).order_by(IndividualTarget.position.asc(), IndividualTarget.id.asc()).first()
    if it:
        db.delete(it)
        db.commit()
