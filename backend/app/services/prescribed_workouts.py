"""Helpers for "what did the coach prescribe to this athlete on which day?"
and the auto-miss backfill that runs when read paths surface old gaps.

Used by both the calendar router (per-week reads) and the stats router
(12-week / 12-month consistency window). Kept in one place so the two
stay in lock-step on what counts as "prescribed".
"""
from datetime import date
from typing import Optional
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from ..models.user import User
from ..models.workout import (
    GroupWorkout,
    GroupWorkoutRecipient,
    IndividualTarget,
    WorkoutLog,
)


def _gw_has_content(gw: GroupWorkout) -> bool:
    return bool(gw.title or gw.content or gw.warmup or gw.main_session or gw.cooldown)


def _it_has_content(it: IndividualTarget) -> bool:
    return bool(it.title or it.note or it.warmup or it.main_session or it.cooldown)


def prescribed_dates_with_types(
    db: Session, athlete: User, earliest: date, end_exclusive: date
) -> dict[date, str]:
    """All dates in [earliest, end_exclusive) where the athlete had a planned
    workout — either an individual target with content, or a published group
    workout that applies to them (broadcast or explicit recipient).

    Returns a dict mapping each date to the active workout type
    (`simple`, `easy`, `tempo`, `long`, `intervals`, `fartlek`, `race`,
    `rest`). When both an individual override and a group workout exist for
    the same day, the individual override wins — that mirrors the calendar's
    display rules.

    Mirrors the filtering used by /calendar's _build_week and
    /calendar/_pick_workout_for_athlete.
    """
    out: dict[date, str] = {}

    # Group workouts first (lower priority).
    if athlete.training_group_id:
        gws = (
            db.query(GroupWorkout)
            .filter(
                GroupWorkout.training_group_id == athlete.training_group_id,
                GroupWorkout.date >= earliest,
                GroupWorkout.date < end_exclusive,
            )
            .order_by(GroupWorkout.id.desc())  # newest wins for a date
            .all()
        )
        wids_with_content = [g.id for g in gws if _gw_has_content(g)]
        if wids_with_content:
            recip_pairs = db.query(
                GroupWorkoutRecipient.group_workout_id,
                GroupWorkoutRecipient.athlete_id,
            ).filter(
                GroupWorkoutRecipient.group_workout_id.in_(wids_with_content)
            ).all()
            recips: dict[int, set[int]] = {}
            for wid, aid in recip_pairs:
                recips.setdefault(wid, set()).add(aid)
            # iterate gws in DB order (already newest-first within day)
            seen_dates: set[date] = set()
            for gw in gws:
                if gw.id not in set(wids_with_content):
                    continue
                if gw.date in seen_dates:
                    continue  # newest already claimed this date
                rec = recips.get(gw.id, set())
                if not rec or athlete.id in rec:
                    out[gw.date] = gw.workout_type or "simple"
                    seen_dates.add(gw.date)

    # Individual targets — applies on top, overrides group.
    its = (
        db.query(IndividualTarget)
        .filter(
            IndividualTarget.athlete_id == athlete.id,
            IndividualTarget.date >= earliest,
            IndividualTarget.date < end_exclusive,
        )
        .all()
    )
    for it in its:
        if it.hidden:
            continue  # coach-only draft — invisible to the athlete, never "prescribed"
        if not _it_has_content(it):
            continue
        # Personal note that doesn't override the group → still prescribed
        # (counts as a day with planned work). But the *type* used for
        # backfill decisions should be the individual's type when overriding,
        # else the group type (already populated above).
        if it.override_group or it.date not in out:
            out[it.date] = it.workout_type or "simple"

    return out


def prescribed_dates(
    db: Session, athlete: User, earliest: date, end_exclusive: date
) -> set[date]:
    """Same as `prescribed_dates_with_types`, but returns just the dates.
    Kept for callers that don't care about the workout type."""
    return set(prescribed_dates_with_types(db, athlete, earliest, end_exclusive).keys())


# Rest days are skipped — the default state for "rest" is "didn't run", so
# auto-marking them missed would be wrong.
_SKIP_TYPES = {"rest"}


def backfill_missed(
    db: Session,
    athlete: User,
    start: date,
    end_exclusive: date,
    today: date,
) -> int:
    """For every prescribed day in [start, end_exclusive) that is strictly
    before today, is not a "rest" day, and has no WorkoutLog row, insert a
    WorkoutLog with status="missed", completed=False, is_auto_marked=True.

    Idempotent: the (athlete_id, date) unique constraint
    `uq_log_athlete_date` makes duplicate inserts a no-op. We catch
    IntegrityError per-row and continue so a race with another request
    doesn't take the whole call down.

    Returns the number of rows actually inserted.
    """
    if start >= end_exclusive:
        return 0

    prescribed_by_type = prescribed_dates_with_types(db, athlete, start, end_exclusive)
    if not prescribed_by_type:
        return 0

    existing_dates = {
        d for (d,) in db.query(WorkoutLog.date)
        .filter(
            WorkoutLog.athlete_id == athlete.id,
            WorkoutLog.date >= start,
            WorkoutLog.date < end_exclusive,
        )
        .all()
    }

    to_insert = [
        d for d, t in prescribed_by_type.items()
        if d < today and t not in _SKIP_TYPES and d not in existing_dates
    ]
    if not to_insert:
        return 0

    inserted = 0
    for d in to_insert:
        log = WorkoutLog(
            athlete_id=athlete.id,
            date=d,
            status="missed",
            completed=False,
            distance_km=None,
            notes=None,
            manual_override=False,
            is_auto_marked=True,
        )
        try:
            db.add(log)
            db.flush()
            inserted += 1
        except IntegrityError:
            # Concurrent backfill inserted the same row first — fine.
            db.rollback()
    if inserted:
        db.commit()
    return inserted
