"""FR-A: reusable multi-week workout plan templates."""
import json
from datetime import date, timedelta
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import require_coach, get_active_team_id
from ..models.user import User
from ..models.workout import GroupWorkout, IndividualTarget, GroupWorkoutHide
from ..models.workout_template import WorkoutTemplate, WorkoutTemplateDay
from ..models.training_group import TrainingGroup
from ..models.group_coach import GroupCoach
from ..schemas.workout_template import (
    TemplateUpsert, TemplateSummary, TemplateDetail,
    TemplateApply, TemplateApplyAthlete, TemplateApplyResult,
)
from ..services.coach_scope import visible_group_ids as _visible_group_ids
from ..services.coach_scope import can_coach_target_athlete
from ..services.notifications import notify_many

router = APIRouter(prefix="/workout-templates", tags=["workout-templates"])

ALLOWED_TYPES = {"simple", "easy", "tempo", "long", "intervals", "fartlek", "race", "rest", "strength", "cycling"}

# Human labels per workout type (mirrors WORKOUT_TYPES in PlanBuilder.jsx). Used
# to default an applied workout's title when the coach left the title blank.
TYPE_LABELS = {
    "simple": "Other", "easy": "Easy run", "rest": "Rest day", "tempo": "Tempo",
    "long": "Long run", "intervals": "Intervals", "fartlek": "Fartlek",
    "race": "Race", "strength": "Strength", "cycling": "Cycling",
}


def _apply_title(d) -> str:
    """Title to write when materializing a plan day — the coach's title, or the
    workout type's label (e.g. 'Easy run') when they left it blank."""
    if d.title and d.title.strip():
        return d.title
    return TYPE_LABELS.get(d.workout_type, d.workout_type)


def _clean(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    s = s.strip()
    return s or None


def _selected_weeks(weeks: Optional[list[int]], weeks_count: int) -> set[int]:
    """Normalize the requested week subset. None/empty → all weeks."""
    chosen = {w for w in (weeks or []) if 1 <= w <= weeks_count}
    return chosen or set(range(1, weeks_count + 1))


def _weeks_date_filter(date_col, start_monday, selected: set[int]):
    """SQLAlchemy predicate: `date_col` falls inside any selected week's 7-day
    range, where week w spans [start_monday + (w-1)*7, start_monday + w*7)."""
    from sqlalchemy import and_, or_
    ranges = []
    for w in selected:
        lo = start_monday + timedelta(weeks=w - 1)
        hi = start_monday + timedelta(weeks=w)
        ranges.append(and_(date_col >= lo, date_col < hi))
    return or_(*ranges)


def _owned_template(db: Session, template_id: int, coach: User, active_team_id: Optional[int]) -> WorkoutTemplate:
    t = db.get(WorkoutTemplate, template_id)
    if t is None:
        raise HTTPException(status_code=404, detail="Template not found")
    if coach.role == "admin" or t.created_by == coach.id:
        return t
    # Group-scoped plans are shared with all coaches of that group.
    if t.group_id is not None and t.group_id in _visible_group_ids(coach, db, active_team_id):
        return t
    raise HTTPException(status_code=404, detail="Template not found")


def _write_days(db: Session, template: WorkoutTemplate, days) -> None:
    """Replace all of a template's days from the incoming list. Multiple workouts
    may share a (week, day_of_week) cell — ordered by arrival via `position`."""
    db.query(WorkoutTemplateDay).filter(
        WorkoutTemplateDay.template_id == template.id
    ).delete(synchronize_session=False)
    pos_by_cell: dict[tuple, int] = {}
    for d in days:
        if d.week_number > template.weeks_count:
            continue  # ignore days beyond the declared week count
        cell = (d.week_number, d.day_of_week)
        position = pos_by_cell.get(cell, 0)
        pos_by_cell[cell] = position + 1
        db.add(WorkoutTemplateDay(
            template_id=template.id,
            week_number=d.week_number,
            day_of_week=d.day_of_week,
            position=position,
            workout_type=d.workout_type if d.workout_type in ALLOWED_TYPES else "simple",
            title=_clean(d.title),
            content=_clean(d.content),
            warmup=_clean(d.warmup),
            main_session=_clean(d.main_session),
            cooldown=_clean(d.cooldown),
            distance_km=d.distance_km,
        ))


def _serialize_targets(targets: dict[int, float], weeks_count: int) -> Optional[str]:
    """Keep only positive targets within the declared week range; store as JSON."""
    clean = {int(w): float(v) for w, v in (targets or {}).items()
             if 1 <= int(w) <= weeks_count and v and float(v) > 0}
    return json.dumps(clean) if clean else None


def _parse_targets(raw: Optional[str]) -> dict[int, float]:
    if not raw:
        return {}
    try:
        return {int(k): float(v) for k, v in json.loads(raw).items()}
    except (ValueError, TypeError):
        return {}


def _detail(t: WorkoutTemplate) -> TemplateDetail:
    return TemplateDetail(
        id=t.id, name=t.name, description=t.description,
        weeks_count=t.weeks_count,
        days=sorted(t.days, key=lambda d: (d.week_number, d.day_of_week, d.position)),
        week_targets=_parse_targets(t.week_targets),
        group_id=t.group_id,
        group_name=t.group.name if t.group else None,
    )


def _validate_group(db: Session, coach: User, active_team_id: Optional[int], group_id: Optional[int]) -> Optional[int]:
    """A coach may only scope a plan to a group they coach."""
    if group_id is None:
        return None
    if coach.role != "admin" and group_id not in _visible_group_ids(coach, db, active_team_id):
        raise HTTPException(status_code=403, detail="Not a coach of that group")
    return group_id


def _is_main_coach(coach: User, db: Session, group_id: int) -> bool:
    """Only the group's main coach (or an admin) may apply a plan to the group."""
    if coach.role == "admin":
        return True
    return db.query(GroupCoach).filter(
        GroupCoach.group_id == group_id,
        GroupCoach.user_id == coach.id,
        GroupCoach.role == "main",
    ).first() is not None


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[TemplateSummary])
def list_templates(
    coach: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
    active_team_id: Annotated[Optional[int], Depends(get_active_team_id)],
):
    # Visible = own plans (general or group) + group-scoped plans for groups the
    # coach coaches. Admins see all.
    from sqlalchemy import func, or_
    q = db.query(WorkoutTemplate)
    if coach.role != "admin":
        visible = _visible_group_ids(coach, db, active_team_id)
        conds = [WorkoutTemplate.created_by == coach.id]
        if visible:
            conds.append(WorkoutTemplate.group_id.in_(visible))
        q = q.filter(or_(*conds))
    templates = q.order_by(WorkoutTemplate.created_at.desc()).all()
    if not templates:
        return []
    # One grouped query for all day counts instead of a COUNT per template (N+1).
    counts = dict(
        db.query(WorkoutTemplateDay.template_id, func.count(WorkoutTemplateDay.id))
        .filter(WorkoutTemplateDay.template_id.in_([t.id for t in templates]))
        .group_by(WorkoutTemplateDay.template_id)
        .all()
    )
    # Batch group names to avoid an N+1 per template.
    gids = {t.group_id for t in templates if t.group_id is not None}
    gnames = dict(
        db.query(TrainingGroup.id, TrainingGroup.name).filter(TrainingGroup.id.in_(gids)).all()
    ) if gids else {}
    return [
        TemplateSummary(
            id=t.id, name=t.name, description=t.description,
            weeks_count=t.weeks_count, day_count=counts.get(t.id, 0),
            group_id=t.group_id, group_name=gnames.get(t.group_id),
        )
        for t in templates
    ]


@router.get("/{template_id}", response_model=TemplateDetail)
def get_template(
    template_id: int,
    coach: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
    active_team_id: Annotated[Optional[int], Depends(get_active_team_id)],
):
    t = _owned_template(db, template_id, coach, active_team_id)
    return _detail(t)


@router.post("", response_model=TemplateDetail, status_code=status.HTTP_201_CREATED)
def create_template(
    body: TemplateUpsert,
    coach: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
    active_team_id: Annotated[Optional[int], Depends(get_active_team_id)],
):
    t = WorkoutTemplate(
        team_id=active_team_id,
        name=body.name,
        description=_clean(body.description),
        weeks_count=body.weeks_count,
        week_targets=_serialize_targets(body.week_targets, body.weeks_count),
        group_id=_validate_group(db, coach, active_team_id, body.group_id),
        created_by=coach.id,
    )
    db.add(t)
    db.flush()
    _write_days(db, t, body.days)
    db.commit()
    db.refresh(t)
    return _detail(t)


@router.put("/{template_id}", response_model=TemplateDetail)
def update_template(
    template_id: int,
    body: TemplateUpsert,
    coach: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
    active_team_id: Annotated[Optional[int], Depends(get_active_team_id)],
):
    t = _owned_template(db, template_id, coach, active_team_id)
    t.name = body.name
    t.description = _clean(body.description)
    t.weeks_count = body.weeks_count
    t.week_targets = _serialize_targets(body.week_targets, body.weeks_count)
    t.group_id = _validate_group(db, coach, active_team_id, body.group_id)
    _write_days(db, t, body.days)
    db.commit()
    db.refresh(t)
    return _detail(t)


@router.delete("/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(
    template_id: int,
    coach: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
    active_team_id: Annotated[Optional[int], Depends(get_active_team_id)],
):
    t = _owned_template(db, template_id, coach, active_team_id)
    db.delete(t)
    db.commit()


@router.post("/{template_id}/apply", response_model=TemplateApplyResult)
def apply_template(
    template_id: int,
    body: TemplateApply,
    coach: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
    active_team_id: Annotated[Optional[int], Depends(get_active_team_id)],
):
    """Materialize a template into GroupWorkout rows for a group, starting from
    the Monday of `start_date`."""
    t = _owned_template(db, template_id, coach, active_team_id)

    # Writing plans is open to any group coach, but applying to the group
    # (publishing group workouts) is the main coach's call only.
    if not _is_main_coach(coach, db, body.group_id):
        raise HTTPException(status_code=403, detail="Only the main coach can apply a plan to the group")

    # Snap to the SUNDAY of the chosen week (weeks run Sun–Sat, matching the
    # athlete calendar and the builder's Sunday-first columns). day_of_week is
    # 0=Mon..6=Sun, so the in-week offset is (dow+1)%7 → Sun=0, Mon=1, … Sat=6.
    week_start = body.start_date - timedelta(days=(body.start_date.weekday() + 1) % 7)

    # Which plan weeks to apply (None/empty = all). Selected weeks keep the exact
    # dates apply-all would give them; unselected weeks are neither written nor wiped.
    selected = _selected_weeks(body.weeks, t.weeks_count)

    days = sorted(t.days, key=lambda d: (d.week_number, d.day_of_week, d.position))
    days = [d for d in days if d.week_number in selected]
    # Map each template day to its calendar date up front so we can both detect
    # collisions and report the plan's end date.
    targets = {
        d: week_start + timedelta(weeks=d.week_number - 1, days=(d.day_of_week + 1) % 7)
        for d in days
    }
    # Override scope: applying wipes every group workout across ONLY the selected
    # weeks' ranges, then writes the plan fresh.
    existing = db.query(GroupWorkout).filter(
        GroupWorkout.training_group_id == body.group_id,
        _weeks_date_filter(GroupWorkout.date, week_start, selected),
    )
    conflicts = existing.count()
    replaced = 0
    if conflicts and not body.replace:
        raise HTTPException(
            status_code=409,
            detail=f"{conflicts} workout(s) in the plan's {len(selected)} selected week(s) "
                   f"will be replaced; re-apply with replace=true to overwrite",
        )
    if conflicts:
        existing.delete(synchronize_session=False)
        replaced = conflicts

    created = 0
    last_date = week_start
    for d in days:
        target = targets[d]
        last_date = max(last_date, target)
        db.add(GroupWorkout(
            team_id=active_team_id,
            training_group_id=body.group_id,
            date=target,
            workout_type=d.workout_type,
            title=_apply_title(d),
            content=d.content,
            warmup=d.warmup,
            main_session=d.main_session,
            cooldown=d.cooldown,
            distance_km=d.distance_km,
            created_by=coach.id,
        ))
        created += 1

    # One summary notification to the whole group instead of N per-workout pings.
    if created:
        athlete_ids = [
            r[0] for r in db.query(User.id)
            .filter(User.training_group_id == body.group_id, User.role == "athlete")
            .all()
        ]
        notify_many(
            db, athlete_ids, "new_workout",
            f"Coach published the '{t.name}' plan starting {week_start.strftime('%b %d')}",
            f"/calendar?date={week_start.isoformat()}",
        )

    db.commit()
    return TemplateApplyResult(created=created, replaced=replaced,
                              week_start=week_start, end_date=last_date)


@router.post("/{template_id}/apply-athlete", response_model=TemplateApplyResult)
def apply_template_to_athlete(
    template_id: int,
    body: TemplateApplyAthlete,
    coach: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
    active_team_id: Annotated[Optional[int], Depends(get_active_team_id)],
):
    """Materialize a plan into IndividualTarget rows for one athlete, starting
    from the Monday of `start_date`. Defaults to NOT overriding the group
    workout (shows alongside it)."""
    t = _owned_template(db, template_id, coach, active_team_id)

    athlete = db.get(User, body.athlete_id)
    if not can_coach_target_athlete(coach, athlete, db):
        raise HTTPException(status_code=404, detail="Athlete not found")

    # Sunday-based week (Sun–Sat) — see apply_template. Offset (dow+1)%7.
    week_start = body.start_date - timedelta(days=(body.start_date.weekday() + 1) % 7)
    selected = _selected_weeks(body.weeks, t.weeks_count)
    days = sorted(t.days, key=lambda d: (d.week_number, d.day_of_week, d.position))
    days = [d for d in days if d.week_number in selected]
    targets = {
        d: week_start + timedelta(weeks=d.week_number - 1, days=(d.day_of_week + 1) % 7)
        for d in days
    }

    # Clean override: wipe individual targets across ONLY the selected weeks'
    # ranges, then write the plan fresh.
    existing = db.query(IndividualTarget).filter(
        IndividualTarget.athlete_id == body.athlete_id,
        _weeks_date_filter(IndividualTarget.date, week_start, selected),
    )
    conflicts = existing.count()
    replaced = 0
    if conflicts and not body.replace:
        raise HTTPException(
            status_code=409,
            detail=f"{conflicts} personal workout(s) in the plan's {len(selected)} selected week(s) "
                   f"will be replaced; re-apply with replace=true to overwrite",
        )
    if conflicts:
        existing.delete(synchronize_session=False)
        replaced = conflicts
    # Clear any stale "hide group" rows in the selected ranges so a re-apply starts clean.
    db.query(GroupWorkoutHide).filter(
        GroupWorkoutHide.athlete_id == body.athlete_id,
        _weeks_date_filter(GroupWorkoutHide.date, week_start, selected),
    ).delete(synchronize_session=False)

    created = 0
    last_date = week_start
    target_dates = set()
    # Preserve per-day ordering so the first plan workout on a day is the "main".
    pos_by_date: dict = {}
    for d in days:
        target = targets[d]
        last_date = max(last_date, target)
        target_dates.add(target)
        position = pos_by_date.get(target, 0)
        pos_by_date[target] = position + 1
        db.add(IndividualTarget(
            team_id=active_team_id,
            athlete_id=body.athlete_id,
            date=target,
            note="",
            position=position,
            # "Override the group workout" → the plan's sessions always show
            # (additional) and we hide the group workout on those days (below).
            additional=body.override_group,
            workout_type=d.workout_type,
            title=_apply_title(d),
            content=d.content,
            warmup=d.warmup,
            main_session=d.main_session,
            cooldown=d.cooldown,
            distance_km=d.distance_km,
            created_by=coach.id,
        ))
        created += 1

    if body.override_group:
        # Hide the group workout on every day the plan fills.
        existing_hide = {
            h.date for h in db.query(GroupWorkoutHide.date).filter(
                GroupWorkoutHide.athlete_id == body.athlete_id,
                GroupWorkoutHide.date.in_(target_dates),
            ).all()
        }
        for td in target_dates:
            if td not in existing_hide:
                db.add(GroupWorkoutHide(athlete_id=body.athlete_id, date=td, created_by=coach.id))

    if created:
        notify_many(
            db, [body.athlete_id], "new_workout",
            f"Coach assigned you the '{t.name}' plan starting {week_start.strftime('%b %d')}",
            f"/calendar?date={week_start.isoformat()}",
        )

    db.commit()
    return TemplateApplyResult(created=created, replaced=replaced,
                              week_start=week_start, end_date=last_date)
