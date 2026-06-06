"""FR-A: reusable multi-week workout plan templates."""
from datetime import date, timedelta
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import require_coach, get_active_team_id
from ..models.user import User
from ..models.workout import GroupWorkout
from ..models.workout_template import WorkoutTemplate, WorkoutTemplateDay
from ..schemas.workout_template import (
    TemplateUpsert, TemplateSummary, TemplateDetail,
    TemplateApply, TemplateApplyResult,
)
from ..services.coach_scope import visible_group_ids as _visible_group_ids
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
    # Admins may touch any template in their active team; coaches only their team's.
    if coach.role != "admin" and t.team_id != active_team_id:
        raise HTTPException(status_code=404, detail="Template not found")
    return t


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
        ))


def _detail(t: WorkoutTemplate) -> TemplateDetail:
    return TemplateDetail(
        id=t.id, name=t.name, description=t.description,
        weeks_count=t.weeks_count,
        days=sorted(t.days, key=lambda d: (d.week_number, d.day_of_week)),
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.get("", response_model=list[TemplateSummary])
def list_templates(
    coach: Annotated[User, Depends(require_coach)],
    db: Annotated[Session, Depends(get_db)],
    active_team_id: Annotated[Optional[int], Depends(get_active_team_id)],
):
    q = db.query(WorkoutTemplate)
    if active_team_id is not None:
        q = q.filter(WorkoutTemplate.team_id == active_team_id)
    elif coach.role != "admin":
        return []  # a coach with no active team sees no templates
    templates = q.order_by(WorkoutTemplate.created_at.desc()).all()
    if not templates:
        return []
    # One grouped query for all day counts instead of a COUNT per template (N+1).
    from sqlalchemy import func
    counts = dict(
        db.query(WorkoutTemplateDay.template_id, func.count(WorkoutTemplateDay.id))
        .filter(WorkoutTemplateDay.template_id.in_([t.id for t in templates]))
        .group_by(WorkoutTemplateDay.template_id)
        .all()
    )
    return [
        TemplateSummary(
            id=t.id, name=t.name, description=t.description,
            weeks_count=t.weeks_count, day_count=counts.get(t.id, 0),
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

    if body.group_id not in _visible_group_ids(coach, db, active_team_id):
        raise HTTPException(status_code=403, detail="Not a coach of that group")

    # Snap to the Monday of the chosen week so day_of_week=0 lands on a Monday.
    start_monday = body.start_date - timedelta(days=body.start_date.weekday())

    days = sorted(t.days, key=lambda d: (d.week_number, d.day_of_week))
    # Map each template day to its calendar date up front so we can both detect
    # collisions and report the plan's end date.
    targets = {
        d: start_monday + timedelta(weeks=d.week_number - 1, days=d.day_of_week)
        for d in days
    }
    target_dates = set(targets.values())

    # Idempotency: a prior apply (or manual workouts) on the plan's dates would
    # otherwise stack duplicates, since GroupWorkout allows many per (group,date).
    replaced = 0
    if target_dates:
        existing = db.query(GroupWorkout).filter(
            GroupWorkout.training_group_id == body.group_id,
            GroupWorkout.date.in_(target_dates),
        )
        conflicts = existing.count()
        if conflicts and not body.replace:
            raise HTTPException(
                status_code=409,
                detail=f"{conflicts} workout(s) already exist on these dates; "
                       f"re-apply with replace=true to overwrite",
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
