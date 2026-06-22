"""FR-A: reusable multi-week workout plan templates."""
import json
from datetime import date, timedelta
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import require_coach, get_active_team_id
from ..models.user import User
from ..models.workout import GroupWorkout, IndividualTarget
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

ALLOWED_TYPES = {"simple", "easy", "tempo", "long", "intervals", "fartlek", "race", "rest"}


def _clean(s: Optional[str]) -> Optional[str]:
    if s is None:
        return None
    s = s.strip()
    return s or None


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
    """Replace all of a template's days from the incoming list."""
    db.query(WorkoutTemplateDay).filter(
        WorkoutTemplateDay.template_id == template.id
    ).delete(synchronize_session=False)
    seen = set()
    for d in days:
        if d.week_number > template.weeks_count:
            continue  # ignore days beyond the declared week count
        key = (d.week_number, d.day_of_week)
        if key in seen:
            raise HTTPException(status_code=422, detail=f"Duplicate day {key}")
        seen.add(key)
        db.add(WorkoutTemplateDay(
            template_id=template.id,
            week_number=d.week_number,
            day_of_week=d.day_of_week,
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
        days=sorted(t.days, key=lambda d: (d.week_number, d.day_of_week)),
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

    # Snap to the Monday of the chosen week so day_of_week=0 lands on a Monday.
    start_monday = body.start_date - timedelta(days=body.start_date.weekday())

    days = sorted(t.days, key=lambda d: (d.week_number, d.day_of_week))
    # Map each template day to its calendar date up front so we can both detect
    # collisions and report the plan's end date.
    targets = {
        d: start_monday + timedelta(weeks=d.week_number - 1, days=d.day_of_week)
        for d in days
    }
    # Override scope: applying wipes EVERY group workout across the plan's whole
    # weeks_count-week range (start Monday → end of the last week), then writes
    # the plan fresh — a clean "override all", not just the days the plan fills.
    range_end_excl = start_monday + timedelta(weeks=t.weeks_count)
    existing = db.query(GroupWorkout).filter(
        GroupWorkout.training_group_id == body.group_id,
        GroupWorkout.date >= start_monday,
        GroupWorkout.date < range_end_excl,
    )
    conflicts = existing.count()
    replaced = 0
    if conflicts and not body.replace:
        raise HTTPException(
            status_code=409,
            detail=f"{conflicts} workout(s) in the plan's {t.weeks_count} week(s) "
                   f"will be replaced; re-apply with replace=true to overwrite",
        )
    if conflicts:
        existing.delete(synchronize_session=False)
        replaced = conflicts

    created = 0
    last_date = start_monday
    for d in days:
        target = targets[d]
        last_date = max(last_date, target)
        db.add(GroupWorkout(
            team_id=active_team_id,
            training_group_id=body.group_id,
            date=target,
            workout_type=d.workout_type,
            title=d.title,
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
            f"Coach published the '{t.name}' plan starting {start_monday.strftime('%b %d')}",
            f"/calendar?date={start_monday.isoformat()}",
        )

    db.commit()
    return TemplateApplyResult(created=created, replaced=replaced,
                              start_monday=start_monday, end_date=last_date)


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

    start_monday = body.start_date - timedelta(days=body.start_date.weekday())
    days = sorted(t.days, key=lambda d: (d.week_number, d.day_of_week))
    targets = {
        d: start_monday + timedelta(weeks=d.week_number - 1, days=d.day_of_week)
        for d in days
    }

    # Clean override: wipe every individual target across the plan's whole range,
    # then write the plan fresh.
    range_end_excl = start_monday + timedelta(weeks=t.weeks_count)
    existing = db.query(IndividualTarget).filter(
        IndividualTarget.athlete_id == body.athlete_id,
        IndividualTarget.date >= start_monday,
        IndividualTarget.date < range_end_excl,
    )
    conflicts = existing.count()
    replaced = 0
    if conflicts and not body.replace:
        raise HTTPException(
            status_code=409,
            detail=f"{conflicts} personal workout(s) in the plan's {t.weeks_count} week(s) "
                   f"will be replaced; re-apply with replace=true to overwrite",
        )
    if conflicts:
        existing.delete(synchronize_session=False)
        replaced = conflicts

    created = 0
    last_date = start_monday
    for d in days:
        target = targets[d]
        last_date = max(last_date, target)
        db.add(IndividualTarget(
            team_id=active_team_id,
            athlete_id=body.athlete_id,
            date=target,
            note="",
            override_group=body.override_group,
            workout_type=d.workout_type,
            title=d.title,
            content=d.content,
            warmup=d.warmup,
            main_session=d.main_session,
            cooldown=d.cooldown,
            distance_km=d.distance_km,
            created_by=coach.id,
        ))
        created += 1

    if created:
        notify_many(
            db, [body.athlete_id], "new_workout",
            f"Coach assigned you the '{t.name}' plan starting {start_monday.strftime('%b %d')}",
            f"/calendar?date={start_monday.isoformat()}",
        )

    db.commit()
    return TemplateApplyResult(created=created, replaced=replaced,
                              start_monday=start_monday, end_date=last_date)
