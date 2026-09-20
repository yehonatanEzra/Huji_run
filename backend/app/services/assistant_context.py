"""Data access for the AI coach. Splits into a lean always-on base prompt
(profile + PBs + last 7 days + notebook) and three on-demand tools the model
calls when it needs deeper history: get_load, get_log, get_race_history.

All read-only, all scoped to the one athlete. Reuses the workout formatting and
PB helpers from athlete_context to stay DRY."""
from __future__ import annotations
from datetime import date, timedelta
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.user import User
from ..models.training_group import TrainingGroup
from ..models.workout import (
    GroupWorkout, GroupWorkoutRecipient, IndividualTarget, WorkoutLog, GroupWorkoutHide,
)
from ..models.race import Result, Heat, Race
from ..models.assistant import AthleteNotebook
from .athlete_context import _fmt_workout, _personal_bests
from .assistant_prompts import get_prompt

LOAD_MONTHS = 6
LOG_MAX_DAYS = 120


def _monday(d: date) -> date:
    return d - timedelta(days=d.weekday())


def _first_log_date(db: Session, athlete: User) -> date | None:
    return db.query(func.min(WorkoutLog.date)).filter(
        WorkoutLog.athlete_id == athlete.id
    ).scalar()


def get_load(db: Session, athlete: User) -> str:
    """Weekly volume (km + number of runs) from the athlete's first log (or 6
    months ago, whichever is later) through today. All weeks shown, including
    zero weeks, so gaps are visible. Runs = completed + partial."""
    today = date.today()
    first = _first_log_date(db, athlete)
    if first is None:
        return "No training logged yet."
    start = max(first, today - timedelta(days=LOAD_MONTHS * 30))
    start = _monday(start)

    logs = db.query(WorkoutLog).filter(
        WorkoutLog.athlete_id == athlete.id,
        WorkoutLog.date >= start,
        WorkoutLog.date <= today,
        WorkoutLog.status.in_(("completed", "partial")),
    ).all()

    # bucket by Monday-start week
    buckets: dict[date, list[WorkoutLog]] = {}
    for l in logs:
        buckets.setdefault(_monday(l.date), []).append(l)

    lines: list[str] = []
    wk = start
    n = 1
    while wk <= today:
        entries = buckets.get(wk, [])
        km = sum(l.distance_km or 0.0 for l in entries)
        lines.append(f"Week {n} (of {wk.isoformat()}): {km:g}km, {len(entries)} runs")
        wk += timedelta(days=7)
        n += 1
    return "\n".join(lines) if lines else "No training logged yet."


def _planned_map(db: Session, athlete: User, start: date, end: date) -> dict[date, list[str]]:
    """Formatted planned workouts per day across [start, end], from the athlete's
    point of view. Batched (a handful of range queries) rather than per-day, and
    mirrors calendar.py's athlete-view rules: only published group workouts; a
    GroupWorkoutHide drops the group list; when a group workout is visible,
    non-`additional` personal targets are suppressed by it."""
    gid = athlete.training_group_id

    # Group workouts in range, grouped by day (published only).
    gws_by_day: dict[date, list[GroupWorkout]] = {}
    gw_ids: list[int] = []
    if gid:
        gws = (
            db.query(GroupWorkout)
            .filter(GroupWorkout.training_group_id == gid,
                    GroupWorkout.date >= start, GroupWorkout.date <= end)
            .order_by(GroupWorkout.id.asc())
            .all()
        )
        gws = [gw for gw in gws if (gw.content or gw.warmup or gw.main_session or gw.cooldown or gw.title)]
        gw_ids = [gw.id for gw in gws]
        for gw in gws:
            gws_by_day.setdefault(gw.date, []).append(gw)

    # Recipient sets for those workouts (empty set = broadcast to everyone).
    recips: dict[int, set[int]] = {wid: set() for wid in gw_ids}
    if gw_ids:
        for wid, aid in db.query(
            GroupWorkoutRecipient.group_workout_id, GroupWorkoutRecipient.athlete_id
        ).filter(GroupWorkoutRecipient.group_workout_id.in_(gw_ids)).all():
            recips[wid].add(aid)

    hidden_days = {
        hd for (hd,) in db.query(GroupWorkoutHide.date).filter(
            GroupWorkoutHide.athlete_id == athlete.id,
            GroupWorkoutHide.date >= start, GroupWorkoutHide.date <= end,
        ).all()
    }

    targets_by_day: dict[date, list[IndividualTarget]] = {}
    for t in (
        db.query(IndividualTarget)
        .filter(IndividualTarget.athlete_id == athlete.id,
                IndividualTarget.date >= start, IndividualTarget.date <= end,
                IndividualTarget.hidden == False)  # noqa: E712
        .order_by(IndividualTarget.position.asc(), IndividualTarget.id.asc())
        .all()
    ):
        targets_by_day.setdefault(t.date, []).append(t)

    out: dict[date, list[str]] = {}
    days = {*gws_by_day, *targets_by_day}
    for d in days:
        gws = gws_by_day.get(d, [])
        if d in hidden_days:
            gws = []
        else:
            gws = [gw for gw in gws if not recips[gw.id] or athlete.id in recips[gw.id]]
        targets = targets_by_day.get(d, [])
        if gws:
            targets = [t for t in targets if t.additional]
        planned = [_fmt_workout(gw) for gw in gws] + [_fmt_workout(t) for t in targets]
        if planned:
            out[d] = planned
    return out


def _log_line(log: WorkoutLog, planned: list[str]) -> str:
    d = log.date
    plan_str = "; ".join(planned) if planned else "none"
    done = log.status
    if log.distance_km:
        done += f" {log.distance_km:g}km"
    if log.notes and log.notes.strip():
        done += f' — "{log.notes.strip()}"'
    return f"{d.strftime('%Y-%m-%d %a')} | Planned: {plan_str} | Logged: {done}"


def get_log(db: Session, athlete: User, start_date: date, end_date: date) -> str:
    """Day-by-day log for a date range. Only days the athlete actually logged
    something appear (rest days and unreported days are skipped). Range capped
    at 120 days."""
    if start_date > end_date:
        start_date, end_date = end_date, start_date
    if (end_date - start_date).days > LOG_MAX_DAYS:
        start_date = end_date - timedelta(days=LOG_MAX_DAYS)

    logs = db.query(WorkoutLog).filter(
        WorkoutLog.athlete_id == athlete.id,
        WorkoutLog.date >= start_date,
        WorkoutLog.date <= end_date,
    ).order_by(WorkoutLog.date.asc()).all()
    if not logs:
        return f"No training logged between {start_date.isoformat()} and {end_date.isoformat()}."
    planned = _planned_map(db, athlete, start_date, end_date)
    return "\n".join(_log_line(l, planned.get(l.date, [])) for l in logs)


def get_race_history(db: Session, athlete: User) -> str:
    """Approved race results, most recent first. Manual-PB races are excluded —
    only real competitions."""
    from .time_utils import seconds_to_display
    from .athlete_context import _dist_label

    rows = (
        db.query(Race.name, Race.race_date, Heat.distance_m, Result.time_seconds)
        .join(Heat, Result.heat_id == Heat.id)
        .join(Race, Heat.race_id == Race.id)
        .filter(
            Result.user_id == athlete.id,
            Result.status == "approved",
            Race.status == "approved",
            Race.is_manual == False,  # noqa: E712
        )
        .order_by(Race.race_date.desc())
        .all()
    )
    if not rows:
        return "No race results recorded yet."
    return "\n".join(
        f"{name} — {rdate.isoformat()} — {_dist_label(dist)} — {seconds_to_display(secs)}"
        for name, rdate, dist, secs in rows
    )


def _last_7_days(db: Session, athlete: User) -> str:
    """Last 7 days including missed sessions (unlike get_log). Rest days with no
    log are skipped. Gives the model immediate context without a tool call."""
    today = date.today()
    start = today - timedelta(days=6)
    logs = {
        l.date: l for l in db.query(WorkoutLog).filter(
            WorkoutLog.athlete_id == athlete.id,
            WorkoutLog.date >= start,
            WorkoutLog.date <= today,
        ).all()
    }
    planned_map = _planned_map(db, athlete, start, today)
    lines: list[str] = []
    for i in range(7):
        d = start + timedelta(days=i)
        planned = planned_map.get(d, [])
        log = logs.get(d)
        if not planned and not log:
            continue  # empty/rest day
        plan_str = "; ".join(planned) if planned else "none"
        if log:
            done = log.status
            if log.distance_km:
                done += f" {log.distance_km:g}km"
            if log.notes and log.notes.strip():
                done += f' — "{log.notes.strip()}"'
        else:
            done = "not logged"
        lines.append(f"{d.strftime('%Y-%m-%d %a')} | Planned: {plan_str} | {done}")
    return "\n".join(lines) if lines else "Nothing planned or logged in the last 7 days."


def get_notebook_content(db: Session, athlete: User) -> str:
    nb = db.query(AthleteNotebook).filter(AthleteNotebook.athlete_id == athlete.id).first()
    return (nb.content or "").strip() if nb else ""


def build_base_prompt(db: Session, athlete: User, *, include_notebook: bool) -> str:
    """The full system message: admin-editable instructions + this athlete's
    lean context (profile, PBs, last 7 days, and — premium only — notebook)."""
    instructions = get_prompt(db, "system_prompt")

    group = db.get(TrainingGroup, athlete.training_group_id) if athlete.training_group_id else None
    coach = db.get(User, athlete.coach_id) if athlete.coach_id else None
    profile = (
        f"Athlete: {athlete.full_name} ({'male' if athlete.gender == 'M' else 'female'})"
        f"{f', group: {group.name}' if group else ', no training group'}"
        f"{f', coach: {coach.full_name}' if coach else ', no coach'}.\n"
        f"Today: {date.today().strftime('%Y-%m-%d (%A)')}"
    )

    pbs = _personal_bests(db, athlete)
    pb_block = "\n".join(pbs) if pbs else "none recorded yet"

    sections = [
        instructions,
        "=== Athlete Profile ===\n" + profile,
        "=== Personal Bests ===\n" + pb_block,
        "=== Last 7 Days ===\n" + _last_7_days(db, athlete),
    ]

    if include_notebook:
        nb = get_notebook_content(db, athlete)
        sections.append("=== Coach's Notebook (persistent memory) ===\n" + (nb or "empty"))

    return "\n\n".join(sections)
