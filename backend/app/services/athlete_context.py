"""Compiles an athlete's recent training into a compact text digest for the AI
assistant: what the coach planned (group workouts respecting recipients/hides +
personal targets) vs. what the athlete actually logged. Read-only."""
from __future__ import annotations
from datetime import date, timedelta
from sqlalchemy import func
from sqlalchemy.orm import Session

from ..models.user import User
from ..models.training_group import TrainingGroup
from ..models.workout import IndividualTarget, WorkoutLog, GroupWorkoutHide
from ..models.race import Result, Heat, Race
from ..routers.calendar import _workouts_for_athlete
from .time_utils import seconds_to_display

TYPE_LABELS = {
    "simple": "Other", "easy": "Easy run", "rest": "Rest", "tempo": "Tempo",
    "long": "Long run", "intervals": "Intervals", "fartlek": "Fartlek", "race": "Race",
}

DISTANCE_LABELS = {21100: "Half Marathon", 42200: "Marathon"}


def _dist_label(m: int) -> str:
    return DISTANCE_LABELS.get(m, f"{m}m")


def _personal_bests(db: Session, athlete: User) -> list[str]:
    """Athlete's fastest approved time per distance (across all their races)."""
    rows = (
        db.query(Heat.distance_m, func.min(Result.time_seconds))
        .join(Result, Result.heat_id == Heat.id)
        .join(Race, Heat.race_id == Race.id)
        .filter(
            Result.user_id == athlete.id,
            Result.status == "approved",
            Race.status == "approved",
        )
        .group_by(Heat.distance_m)
        .all()
    )
    return [f"{_dist_label(dist)}: {seconds_to_display(secs)}" for dist, secs in sorted(rows)]


def _fmt_workout(w) -> str:
    label = TYPE_LABELS.get(w.workout_type, w.workout_type)
    body = (w.content or "").strip() or " / ".join(
        x.strip() for x in (w.warmup, w.main_session, w.cooldown) if x and x.strip()
    )
    bits = []
    if w.title and w.title.strip():
        bits.append(w.title.strip())
    if body:
        bits.append(body)
    if getattr(w, "distance_km", None):
        bits.append(f"~{w.distance_km:g}km")
    note = getattr(w, "note", None)
    if note and note.strip():
        bits.append(f"(note: {note.strip()})")
    return f"{label}" + (": " + " — ".join(bits) if bits else "")


def build_training_digest(db: Session, athlete: User, days: int = 28) -> str:
    today = date.today()
    start = today - timedelta(days=days - 1)
    gid = athlete.training_group_id

    logs = {
        l.date: l for l in db.query(WorkoutLog).filter(
            WorkoutLog.athlete_id == athlete.id,
            WorkoutLog.date >= start, WorkoutLog.date <= today,
        ).all()
    }
    targets: dict[date, list[IndividualTarget]] = {}
    for t in db.query(IndividualTarget).filter(
        IndividualTarget.athlete_id == athlete.id,
        IndividualTarget.date >= start, IndividualTarget.date <= today,
        IndividualTarget.hidden == False,  # noqa: E712
    ).all():
        targets.setdefault(t.date, []).append(t)
    hidden = {
        hd for (hd,) in db.query(GroupWorkoutHide.date).filter(
            GroupWorkoutHide.athlete_id == athlete.id,
            GroupWorkoutHide.date >= start, GroupWorkoutHide.date <= today,
        ).all()
    }

    lines: list[str] = []
    total_km = 0.0
    completed = 0
    for i in range(days):
        d = start + timedelta(days=i)
        day_targets = targets.get(d, [])
        override = any(t.override_group for t in day_targets)
        planned: list[str] = []
        if gid and d not in hidden and not override:
            for gw in _workouts_for_athlete(db, gid, d, athlete.id, is_coach_view=False):
                planned.append(_fmt_workout(gw))
        for t in day_targets:
            planned.append(_fmt_workout(t))

        log = logs.get(d)
        if not planned and not log:
            continue
        parts = [d.strftime("%Y-%m-%d %a")]
        parts.append("planned: " + ("; ".join(planned) if planned else "nothing scheduled"))
        if log:
            done = log.status
            if log.distance_km:
                done += f" {log.distance_km:g}km"
                total_km += log.distance_km
            if log.status == "completed":
                completed += 1
            if log.notes and log.notes.strip():
                done += f' — "{log.notes.strip()}"'
            parts.append("did: " + done)
        else:
            parts.append("did: not logged")
        lines.append(" | ".join(parts))

    group = db.get(TrainingGroup, gid) if gid else None
    coach = db.get(User, athlete.coach_id) if athlete.coach_id else None
    header = (
        f"Athlete: {athlete.full_name} ({'male' if athlete.gender == 'M' else 'female'})"
        f"{f', group: {group.name}' if group else ', no training group'}"
        f"{f', coach: {coach.full_name}' if coach else ', no coach'}.\n"
        f"Last {days} days: {completed} sessions completed, {total_km:g} km logged."
    )

    pbs = _personal_bests(db, athlete)
    pb_block = ("\n\nPersonal bests:\n" + "\n".join(pbs)) if pbs else "\n\nPersonal bests: none recorded yet."

    body = "\n".join(lines) if lines else "No planned workouts or logged sessions in this window."
    return f"{header}{pb_block}\n\nDay-by-day (planned vs. done):\n{body}"
