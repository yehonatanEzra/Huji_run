from datetime import date, datetime, timedelta
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import require_coach, get_active_team_id
from ..models.user import User
from ..models.training_group import TrainingGroup
from ..models.group_coach import GroupCoach
from ..models.group_add_request import GroupAddRequest
from ..models.workout import GroupWorkout, IndividualTarget, WorkoutLog
from ..models.race import Race, Heat, Result
from ..schemas.auth import UserOut
from ..schemas.workout import CoachDashboardResponse, AthleteWeekRow, WorkoutLogOut, IndividualTargetOut, GroupWorkoutOut
from ..services.coach_scope import coach_groups_with_role, can_coach_target_athlete
from ..services.notifications import notify, notify_many


def _athlete_in_scope(coach: User, athlete: Optional[User]) -> bool:
    """True if `athlete` is one this coach is allowed to act on. Admins see all."""
    if not athlete or athlete.role != "athlete":
        return False
    if coach.role == "admin":
        return True
    return athlete.coach_id == coach.id


def _athletes_query(coach: User, db: Session):
    """Base query for this coach's personal roster (athletes whose coach_id is
    them). Applies to admins too: the coach dashboard/roster is "my athletes",
    while platform-wide user management lives in the admin Users page. Without
    this, an admin keeps seeing athletes they've disconnected from."""
    return db.query(User).filter(User.role == "athlete", User.coach_id == coach.id)


class TrainingGroupCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=20)


class TrainingGroupOut(BaseModel):
    id: int
    name: str
    member_count: int = 0
    role: Optional[str] = None  # this coach's role in the group: 'main' | 'assistant'
    model_config = {"from_attributes": True}


class TrainingGroupDetail(BaseModel):
    id: int
    name: str
    members: list[UserOut]
    role: Optional[str] = None
    model_config = {"from_attributes": True}


class AssignAthleteBody(BaseModel):
    athlete_id: int


class MemberAddResult(BaseModel):
    status: str  # 'added' (immediate) | 'pending' (awaiting main-coach approval)


class PendingAddOut(BaseModel):
    id: int
    athlete_id: int
    athlete_name: str
    requested_by_id: int
    requested_by_name: str
    created_at: datetime


def _discard_pending_for_athlete(db: Session, athlete_id: int) -> None:
    """Clear every pending group-add request for an athlete — called whenever the
    athlete lands in a group (direct add or approval) so competing requests can't
    later resolve and silently override one-group-per-athlete."""
    db.query(GroupAddRequest).filter(GroupAddRequest.athlete_id == athlete_id).delete(
        synchronize_session=False
    )


router = APIRouter(prefix="/coach", tags=["coach"])


def _week_start(d: date) -> date:
    return d - timedelta(days=(d.weekday() + 1) % 7)


# ── Training Groups ──────────────────────────────────────────────────────────
# Group scoping is driven by GroupCoach (main/assistant), not the legacy
# TrainingGroup.coach_id. coach_id is still written (main coach) for back-compat.

@router.get("/groups", response_model=list[TrainingGroupOut])
def list_groups(
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
    active_team_id: Optional[int] = Depends(get_active_team_id),
):
    roles = coach_groups_with_role(coach, db, active_team_id)
    if not roles:
        return []
    groups = (
        db.query(TrainingGroup)
        .filter(TrainingGroup.id.in_(roles.keys()))
        .order_by(TrainingGroup.name)
        .all()
    )
    return [
        TrainingGroupOut(id=g.id, name=g.name, member_count=len(g.members), role=roles.get(g.id))
        for g in groups
    ]


@router.post("/groups", response_model=TrainingGroupOut, status_code=201)
def create_group(
    body: TrainingGroupCreate,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
):
    g = TrainingGroup(name=body.name.strip(), created_by=coach.id, coach_id=coach.id)
    db.add(g)
    db.flush()
    # The creator becomes the main coach — GroupCoach is the source of truth.
    db.add(GroupCoach(user_id=coach.id, group_id=g.id, role="main"))
    db.commit()
    db.refresh(g)
    return TrainingGroupOut(id=g.id, name=g.name, member_count=0, role="main")


@router.get("/groups/{group_id}", response_model=TrainingGroupDetail)
def get_group(
    group_id: int,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
    active_team_id: Optional[int] = Depends(get_active_team_id),
):
    roles = coach_groups_with_role(coach, db, active_team_id)
    if group_id not in roles:
        raise HTTPException(status_code=404, detail="Group not found")
    g = db.get(TrainingGroup, group_id)
    return TrainingGroupDetail(id=g.id, name=g.name, members=g.members, role=roles.get(group_id))


@router.patch("/groups/{group_id}", response_model=TrainingGroupOut)
def rename_group(
    group_id: int,
    body: TrainingGroupCreate,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
    active_team_id: Optional[int] = Depends(get_active_team_id),
):
    roles = coach_groups_with_role(coach, db, active_team_id)
    if group_id not in roles:
        raise HTTPException(status_code=404, detail="Group not found")
    if roles[group_id] != "main":
        raise HTTPException(status_code=403, detail="Only the main coach can rename this group")
    g = db.get(TrainingGroup, group_id)
    g.name = body.name.strip()
    db.commit()
    db.refresh(g)
    return TrainingGroupOut(id=g.id, name=g.name, member_count=len(g.members), role="main")


@router.delete("/groups/{group_id}", status_code=204)
def delete_group(
    group_id: int,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
    active_team_id: Optional[int] = Depends(get_active_team_id),
):
    roles = coach_groups_with_role(coach, db, active_team_id)
    if group_id not in roles:
        raise HTTPException(status_code=404, detail="Group not found")
    if roles[group_id] != "main":
        raise HTTPException(status_code=403, detail="Only the main coach can delete this group")
    g = db.get(TrainingGroup, group_id)
    for member in g.members:
        member.training_group_id = None
    # GroupAddRequest rows cascade (FK); group_coaches + group_workouts have no
    # cascade, so clear them first or the FK pragma blocks the delete.
    db.query(GroupCoach).filter(GroupCoach.group_id == group_id).delete(synchronize_session=False)
    db.query(GroupWorkout).filter(GroupWorkout.training_group_id == group_id).delete(synchronize_session=False)
    db.delete(g)
    db.commit()


@router.post("/groups/{group_id}/members", response_model=MemberAddResult)
def add_member_to_group(
    group_id: int,
    body: AssignAthleteBody,
    response: Response,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
    active_team_id: Optional[int] = Depends(get_active_team_id),
):
    """Add an athlete to a group. Only the athlete's personal coach may add, and
    only to a group they coach. Main coach → immediate; assistant → pending the
    main coach's approval. 'Move' is just an add to a different group."""
    g = db.get(TrainingGroup, group_id)
    if g is None:
        raise HTTPException(status_code=404, detail="Group not found")
    roles = coach_groups_with_role(coach, db, active_team_id)
    role = roles.get(group_id)
    if role is None:
        raise HTTPException(status_code=403, detail="You do not coach this group")

    athlete = db.get(User, body.athlete_id)
    if athlete is None or athlete.role != "athlete":
        raise HTTPException(status_code=404, detail="Athlete not found")
    # Only the personal coach can add (admins bypass and act as main).
    if coach.role != "admin" and athlete.coach_id != coach.id:
        raise HTTPException(status_code=403, detail="You are not this athlete's coach")

    if athlete.training_group_id == group_id:
        return MemberAddResult(status="added")  # already there — idempotent

    if role == "main" or coach.role == "admin":
        athlete.training_group_id = group_id
        _discard_pending_for_athlete(db, athlete.id)
        notify(db, athlete.id, "group_added", f"You were added to the group “{g.name}”.", "/calendar")
        db.commit()
        return MemberAddResult(status="added")

    # Assistant → pending main-coach approval (idempotent via uq).
    existing = (
        db.query(GroupAddRequest)
        .filter(GroupAddRequest.athlete_id == athlete.id, GroupAddRequest.group_id == group_id)
        .first()
    )
    if existing is None:
        db.add(GroupAddRequest(athlete_id=athlete.id, group_id=group_id, requested_by_id=coach.id))
        main_ids = [
            r.user_id for r in db.query(GroupCoach)
            .filter(GroupCoach.group_id == group_id, GroupCoach.role == "main").all()
        ]
        notify_many(
            db, main_ids, "group_add_request",
            f"{coach.full_name} wants to add {athlete.full_name} to “{g.name}”.",
            "/coach/group",
        )
        db.commit()
    response.status_code = status.HTTP_201_CREATED
    return MemberAddResult(status="pending")


@router.delete("/groups/{group_id}/members/{athlete_id}", status_code=204)
def remove_member_from_group(
    group_id: int,
    athlete_id: int,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
    active_team_id: Optional[int] = Depends(get_active_team_id),
):
    """Remove an athlete from a group (they stay coached). Allowed for the group's
    main coach or the athlete's personal coach."""
    g = db.get(TrainingGroup, group_id)
    if g is None:
        raise HTTPException(status_code=404, detail="Group not found")
    athlete = db.get(User, athlete_id)
    if not athlete or athlete.training_group_id != group_id:
        raise HTTPException(status_code=404, detail="Athlete not in this group")
    roles = coach_groups_with_role(coach, db, active_team_id)
    is_main = roles.get(group_id) == "main"
    is_personal = athlete.coach_id == coach.id
    if not (is_main or is_personal or coach.role == "admin"):
        raise HTTPException(status_code=403, detail="Not allowed to remove this athlete")

    athlete.training_group_id = None
    db.query(GroupAddRequest).filter(
        GroupAddRequest.athlete_id == athlete_id, GroupAddRequest.group_id == group_id
    ).delete(synchronize_session=False)
    notify(db, athlete.id, "group_removed", f"You were removed from the group “{g.name}”.", None)
    # If someone other than the personal coach pulled them, tell the personal coach.
    if athlete.coach_id and athlete.coach_id != coach.id:
        notify(db, athlete.coach_id, "group_removed",
               f"{athlete.full_name} was removed from “{g.name}”.", "/coach/group")
    db.commit()


# ── Group-add approvals (assistant-initiated, main-coach-resolved) ───────────

@router.get("/pending-approvals-count")
def pending_approvals_count(
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
    active_team_id: Optional[int] = Depends(get_active_team_id),
):
    """Total pending group-add requests across every group this coach mains."""
    roles = coach_groups_with_role(coach, db, active_team_id)
    main_ids = [gid for gid, r in roles.items() if r == "main"]
    if not main_ids:
        return {"count": 0}
    count = db.query(GroupAddRequest).filter(GroupAddRequest.group_id.in_(main_ids)).count()
    return {"count": count}


@router.get("/groups/{group_id}/pending", response_model=list[PendingAddOut])
def list_pending_adds(
    group_id: int,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
    active_team_id: Optional[int] = Depends(get_active_team_id),
):
    roles = coach_groups_with_role(coach, db, active_team_id)
    role = roles.get(group_id)
    if role is None:
        raise HTTPException(status_code=403, detail="You do not coach this group")
    q = db.query(GroupAddRequest).filter(GroupAddRequest.group_id == group_id)
    if role != "main":
        # Assistants see only the requests they raised (so they don't re-add).
        q = q.filter(GroupAddRequest.requested_by_id == coach.id)
    reqs = q.all()
    out: list[PendingAddOut] = []
    for r in reqs:
        a = db.get(User, r.athlete_id)
        rb = db.get(User, r.requested_by_id)
        out.append(PendingAddOut(
            id=r.id,
            athlete_id=r.athlete_id,
            athlete_name=a.full_name if a else "(unknown)",
            requested_by_id=r.requested_by_id,
            requested_by_name=rb.full_name if rb else "(unknown)",
            created_at=r.created_at,
        ))
    return out


@router.post("/groups/{group_id}/pending/{req_id}/approve", response_model=MemberAddResult)
def approve_pending_add(
    group_id: int,
    req_id: int,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
    active_team_id: Optional[int] = Depends(get_active_team_id),
):
    roles = coach_groups_with_role(coach, db, active_team_id)
    if roles.get(group_id) != "main":
        raise HTTPException(status_code=403, detail="Only the main coach can approve")
    req = db.get(GroupAddRequest, req_id)
    if req is None or req.group_id != group_id:
        raise HTTPException(status_code=404, detail="Request not found")
    g = db.get(TrainingGroup, group_id)
    athlete = db.get(User, req.athlete_id)
    requester_id = req.requested_by_id
    if athlete is None:
        db.delete(req)
        db.commit()
        raise HTTPException(status_code=404, detail="Athlete no longer exists")
    athlete.training_group_id = group_id
    _discard_pending_for_athlete(db, athlete.id)  # removes this + any competing
    notify(db, athlete.id, "group_added", f"You were added to the group “{g.name}”.", "/calendar")
    notify(db, requester_id, "group_add_approved",
           f"{athlete.full_name} was approved for “{g.name}”.", "/coach/group")
    db.commit()
    return MemberAddResult(status="added")


@router.post("/groups/{group_id}/pending/{req_id}/reject", response_model=MemberAddResult)
def reject_pending_add(
    group_id: int,
    req_id: int,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
    active_team_id: Optional[int] = Depends(get_active_team_id),
):
    roles = coach_groups_with_role(coach, db, active_team_id)
    if roles.get(group_id) != "main":
        raise HTTPException(status_code=403, detail="Only the main coach can reject")
    req = db.get(GroupAddRequest, req_id)
    if req is None or req.group_id != group_id:
        raise HTTPException(status_code=404, detail="Request not found")
    g = db.get(TrainingGroup, group_id)
    athlete = db.get(User, req.athlete_id)
    requester_id = req.requested_by_id
    db.delete(req)
    notify(db, requester_id, "group_add_rejected",
           f"Your request to add {athlete.full_name if athlete else 'an athlete'} to "
           f"“{g.name}” was declined.", "/coach/group")
    db.commit()
    return MemberAddResult(status="rejected")


# ── Athletes ─────────────────────────────────────────────────────────────────

@router.get("/athletes", response_model=list[UserOut])
def list_athletes(
    db: Annotated[Session, Depends(get_db)],
    coach: Annotated[User, Depends(require_coach)],
):
    return _athletes_query(coach, db).order_by(User.full_name).all()


@router.get("/athletes/search")
def search_athletes(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
):
    results = (
        _athletes_query(coach, db)
        .filter(User.full_name.ilike(f"{q}%"))
        .order_by(User.full_name)
        .limit(10)
        .all()
    )
    return [{"id": u.id, "full_name": u.full_name, "gender": u.gender, "training_group_id": u.training_group_id} for u in results]


@router.get("/dashboard/week", response_model=CoachDashboardResponse)
def dashboard_week(
    day: date = Query(default_factory=date.today),
    db: Session = Depends(get_db),
    coach_user: User = Depends(require_coach),
):
    ws = _week_start(day)
    week_dates = [ws + timedelta(days=i) for i in range(7)]

    athletes = _athletes_query(coach_user, db).order_by(User.full_name).all()

    logs = db.query(WorkoutLog).filter(WorkoutLog.date.in_(week_dates)).all()
    log_map: dict[tuple, WorkoutLog] = {(l.athlete_id, l.date): l for l in logs}

    targets = db.query(IndividualTarget).filter(IndividualTarget.date.in_(week_dates)).order_by(
        IndividualTarget.position.asc(), IndividualTarget.id.asc()
    ).all()
    targets_by_key: dict[tuple, list] = {}
    for t in targets:
        targets_by_key.setdefault((t.athlete_id, t.date), []).append(t)

    # All workouts in this week's date range, newest-first per (group, date).
    group_workouts = (
        db.query(GroupWorkout)
        .filter(GroupWorkout.date.in_(week_dates))
        .order_by(GroupWorkout.id.desc())
        .all()
    )
    # (group, date) -> [workouts newest-first]
    gw_by_group_day: dict[tuple, list[GroupWorkout]] = {}
    for gw in group_workouts:
        gw_by_group_day.setdefault((gw.training_group_id, gw.date), []).append(gw)

    # Preload recipient targeting for all this-week workouts in one shot.
    from ..models.workout import GroupWorkoutRecipient
    gw_ids = [gw.id for gw in group_workouts]
    gw_recipients: dict[int, set[int]] = {wid: set() for wid in gw_ids}
    if gw_ids:
        for gid, aid in db.query(GroupWorkoutRecipient.group_workout_id, GroupWorkoutRecipient.athlete_id).filter(
            GroupWorkoutRecipient.group_workout_id.in_(gw_ids)
        ).all():
            gw_recipients[gid].add(aid)

    def _pick_for(athlete_id: int, group_id: int, day: date):
        """Newest workout for (group, day) that targets athlete (broadcast or in recipient list)."""
        for gw in gw_by_group_day.get((group_id, day), []):
            rec = gw_recipients.get(gw.id, set())
            if not rec or athlete_id in rec:
                return gw
        return None

    group_map = {g.id: g.name for g in db.query(TrainingGroup).all()}

    from ..models.kudos import Kudos
    from ..models.workout import WorkoutLogComment
    from ..routers.kudos import ALLOWED_EMOJI as KUDOS_EMOJI
    log_ids = [l.id for l in logs]
    per_log_counts: dict[int, dict[str, int]] = {}
    per_log_mine: dict[int, set[str]] = {}
    per_log_comment_count: dict[int, int] = {}
    if log_ids:
        for log_id, emoji, c in (
            db.query(Kudos.workout_log_id, Kudos.emoji, sa_func.count(Kudos.id))
            .filter(Kudos.workout_log_id.in_(log_ids))
            .group_by(Kudos.workout_log_id, Kudos.emoji)
            .all()
        ):
            per_log_counts.setdefault(log_id, {})[emoji] = c
        for log_id, emoji in (
            db.query(Kudos.workout_log_id, Kudos.emoji)
            .filter(Kudos.workout_log_id.in_(log_ids), Kudos.giver_id == coach_user.id)
            .all()
        ):
            per_log_mine.setdefault(log_id, set()).add(emoji)
        for log_id, c in (
            db.query(WorkoutLogComment.workout_log_id, sa_func.count(WorkoutLogComment.id))
            .filter(WorkoutLogComment.workout_log_id.in_(log_ids))
            .group_by(WorkoutLogComment.workout_log_id)
            .all()
        ):
            per_log_comment_count[log_id] = c

    rows = []
    for athlete in athletes:
        days = []
        for d in week_dates:
            log = log_map.get((athlete.id, d))
            day_targets = targets_by_key.get((athlete.id, d), [])
            gw = _pick_for(athlete.id, athlete.training_group_id, d) if athlete.training_group_id else None
            log_out = None
            if log:
                log_out = WorkoutLogOut.model_validate(log)
                counts = per_log_counts.get(log.id, {})
                mine = per_log_mine.get(log.id, set())
                log_out.reactions = [
                    {"emoji": e, "count": counts.get(e, 0), "reacted": e in mine}
                    for e in KUDOS_EMOJI if counts.get(e, 0) > 0 or e in mine
                ]
                log_out.kudos_count = sum(counts.values())
                log_out.has_kudos = bool(mine)
                log_out.comment_count = per_log_comment_count.get(log.id, 0)
            days.append({
                "date": d,
                "log": log_out,
                "targets": [IndividualTargetOut.model_validate(t) for t in day_targets],
                "target": IndividualTargetOut.model_validate(day_targets[0]) if day_targets else None,
                "group_workout": GroupWorkoutOut.model_validate(gw) if gw else None,
            })
        rows.append(AthleteWeekRow(
            id=athlete.id,
            full_name=athlete.full_name,
            gender=athlete.gender,
            group_name=group_map.get(athlete.training_group_id),
            days=days,
        ))

    return CoachDashboardResponse(week_start=ws, athletes=rows)


@router.get("/athletes/{athlete_id}/profile")
def get_athlete_profile(
    athlete_id: int,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
):
    athlete = db.get(User, athlete_id)
    if not _athlete_in_scope(coach, athlete):
        raise HTTPException(status_code=404, detail="Athlete not found")

    group_name = None
    if athlete.training_group_id:
        group = db.get(TrainingGroup, athlete.training_group_id)
        if group:
            group_name = group.name

    total_logs = db.query(sa_func.count(WorkoutLog.id)).filter(
        WorkoutLog.athlete_id == athlete_id
    ).scalar()
    completed_logs = db.query(sa_func.count(WorkoutLog.id)).filter(
        WorkoutLog.athlete_id == athlete_id, WorkoutLog.completed == True
    ).scalar()
    missed_logs = total_logs - completed_logs

    recent_logs = (
        db.query(WorkoutLog)
        .filter(WorkoutLog.athlete_id == athlete_id)
        .order_by(WorkoutLog.date.desc())
        .limit(10)
        .all()
    )

    results = (
        db.query(Result, Heat, Race)
        .join(Heat, Result.heat_id == Heat.id)
        .join(Race, Heat.race_id == Race.id)
        .filter(Result.user_id == athlete_id)
        .order_by(Race.race_date.desc())
        .all()
    )

    def fmt_time(s):
        m, sec = divmod(s, 60)
        h, m = divmod(m, 60)
        if h:
            return f"{h}:{m:02d}:{sec:02d}"
        return f"{m}:{sec:02d}"

    def fmt_dist(d):
        if d >= 1000:
            km = d / 1000
            return f"{km:.1f}km".replace(".0km", "km")
        return f"{d}m"

    race_history = []
    for result, heat, race in results:
        race_history.append({
            "result_id": result.id,
            "race_id": race.id,
            "heat_id": heat.id,
            "is_manual": bool(race.is_manual),
            "race_name": race.name,
            "race_date": race.race_date.isoformat(),
            "distance_m": heat.distance_m,
            "distance_display": fmt_dist(heat.distance_m),
            "heat_label": heat.label,
            "time_seconds": result.time_seconds,
            "time_display": fmt_time(result.time_seconds),
        })

    pbs = {}
    for result, heat, race in results:
        dist = heat.distance_m
        if dist not in pbs or result.time_seconds < pbs[dist]["time_seconds"]:
            pbs[dist] = {
                "distance_m": dist,
                "distance_display": fmt_dist(dist),
                "time_seconds": result.time_seconds,
                "time_display": fmt_time(result.time_seconds),
                "race_name": race.name,
                "race_date": race.race_date.isoformat(),
                "result_id": result.id,
                "race_id": race.id,
                "heat_id": heat.id,
                "is_manual": bool(race.is_manual),
            }
    personal_bests = sorted(pbs.values(), key=lambda x: x["distance_m"])

    return {
        "id": athlete.id,
        "full_name": athlete.full_name,
        "username": athlete.username,
        "gender": athlete.gender,
        "group_name": group_name,
        "training_group_id": athlete.training_group_id,
        "created_at": athlete.created_at.isoformat() if athlete.created_at else None,
        "stats": {
            "total_logs": total_logs,
            "completed": completed_logs,
            "missed": missed_logs,
            "completion_rate": round(completed_logs / total_logs * 100) if total_logs > 0 else 0,
        },
        "recent_logs": [
            {
                "date": l.date.isoformat(),
                "completed": l.completed,
                "status": l.status,
                "distance_km": l.distance_km,
                "notes": l.notes,
            }
            for l in recent_logs
        ],
        "race_history": race_history,
        "personal_bests": personal_bests,
    }


@router.get("/athletes/{athlete_id}/week")
def get_athlete_week(
    athlete_id: int,
    day: date = Query(default_factory=date.today),
    db: Session = Depends(get_db),
    coach_user: User = Depends(require_coach),
):
    athlete = db.get(User, athlete_id)
    if not can_coach_target_athlete(coach_user, athlete, db):
        raise HTTPException(status_code=404, detail="Athlete not found")

    ws = _week_start(day)
    week_dates = [ws + timedelta(days=i) for i in range(7)]

    logs = db.query(WorkoutLog).filter(
        WorkoutLog.athlete_id == athlete_id,
        WorkoutLog.date.in_(week_dates),
    ).all()
    log_map = {l.date: l for l in logs}

    targets = db.query(IndividualTarget).filter(
        IndividualTarget.athlete_id == athlete_id,
        IndividualTarget.date.in_(week_dates),
    ).order_by(IndividualTarget.position.asc(), IndividualTarget.id.asc()).all()
    targets_by_date: dict = {}
    for t in targets:
        targets_by_date.setdefault(t.date, []).append(t)

    gw_map = {}
    if athlete.training_group_id:
        # Newest-first so the per-day picker below grabs the most recent
        # workout that targets this athlete.
        gws = (
            db.query(GroupWorkout)
            .filter(
                GroupWorkout.training_group_id == athlete.training_group_id,
                GroupWorkout.date.in_(week_dates),
            )
            .order_by(GroupWorkout.id.desc())
            .all()
        )
        from ..models.workout import GroupWorkoutRecipient
        gw_ids = [g.id for g in gws]
        recip: dict[int, set[int]] = {wid: set() for wid in gw_ids}
        if gw_ids:
            for gid, aid in db.query(GroupWorkoutRecipient.group_workout_id, GroupWorkoutRecipient.athlete_id).filter(
                GroupWorkoutRecipient.group_workout_id.in_(gw_ids)
            ).all():
                recip[gid].add(aid)
        for gw in gws:  # newest-first
            if gw.date in gw_map:
                continue  # already picked the newer one for this date
            rec_set = recip.get(gw.id, set())
            if rec_set and athlete_id not in rec_set:
                continue  # this workout has explicit recipients and doesn't include this athlete
            gw_map[gw.date] = gw

    from ..models.kudos import Kudos
    from ..models.workout import WorkoutLogComment
    from ..routers.kudos import ALLOWED_EMOJI as KUDOS_EMOJI
    log_ids = [l.id for l in logs]
    per_log_counts: dict[int, dict[str, int]] = {}
    per_log_mine: dict[int, set[str]] = {}
    per_log_comment_count: dict[int, int] = {}
    if log_ids:
        for log_id, emoji, c in (
            db.query(Kudos.workout_log_id, Kudos.emoji, sa_func.count(Kudos.id))
            .filter(Kudos.workout_log_id.in_(log_ids))
            .group_by(Kudos.workout_log_id, Kudos.emoji)
            .all()
        ):
            per_log_counts.setdefault(log_id, {})[emoji] = c
        for log_id, emoji in (
            db.query(Kudos.workout_log_id, Kudos.emoji)
            .filter(Kudos.workout_log_id.in_(log_ids), Kudos.giver_id == coach_user.id)
            .all()
        ):
            per_log_mine.setdefault(log_id, set()).add(emoji)
        for log_id, c in (
            db.query(WorkoutLogComment.workout_log_id, sa_func.count(WorkoutLogComment.id))
            .filter(WorkoutLogComment.workout_log_id.in_(log_ids))
            .group_by(WorkoutLogComment.workout_log_id)
            .all()
        ):
            per_log_comment_count[log_id] = c

    def _log_payload(log):
        counts = per_log_counts.get(log.id, {})
        mine = per_log_mine.get(log.id, set())
        reactions = [
            {"emoji": e, "count": counts.get(e, 0), "reacted": e in mine}
            for e in KUDOS_EMOJI if counts.get(e, 0) > 0 or e in mine
        ]
        return {
            "id": log.id,
            "completed": log.completed,
            "status": log.status,
            "distance_km": log.distance_km,
            "notes": log.notes,
            "kudos_count": sum(counts.values()),
            "reactions": reactions,
            "comment_count": per_log_comment_count.get(log.id, 0),
        }

    def _target_payload(t):
        return {
            "id": t.id,
            "note": t.note,
            "override_group": t.override_group,
            "hidden": t.hidden,
            "position": t.position,
            "workout_type": t.workout_type,
            "title": t.title,
            "content": t.content,
            "warmup": t.warmup,
            "main_session": t.main_session,
            "cooldown": t.cooldown,
            "distance_km": t.distance_km,
        }

    days = []
    for d in week_dates:
        log = log_map.get(d)
        day_targets = targets_by_date.get(d, [])
        gw = gw_map.get(d)
        days.append({
            "date": d.isoformat(),
            "log": _log_payload(log) if log else None,
            "targets": [_target_payload(t) for t in day_targets],
            # compat: primary (first) target for the not-yet-migrated UI
            "target": _target_payload(day_targets[0]) if day_targets else None,
            "group_workout": {
                "content": gw.content,
                "workout_type": gw.workout_type,
                "title": gw.title,
                "warmup": gw.warmup,
                "main_session": gw.main_session,
                "cooldown": gw.cooldown,
                "distance_km": gw.distance_km,
            } if gw and (gw.content or gw.warmup or gw.main_session or gw.cooldown or gw.title) else None,
        })

    return {"week_start": ws.isoformat(), "days": days}


class AddPBRequest(BaseModel):
    athlete_id: int
    distance_m: int
    time_seconds: int
    competition_name: Optional[str] = None
    race_id: Optional[int] = None
    heat_id: Optional[int] = None


@router.post("/athletes/{athlete_id}/pb")
def add_athlete_pb(
    athlete_id: int,
    body: AddPBRequest,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
    coach_team_id: Optional[int] = Depends(get_active_team_id),
):
    from ..services.hall_of_fame import refresh_team_hall_of_fame

    athlete = db.get(User, athlete_id)
    if not _athlete_in_scope(coach, athlete):
        raise HTTPException(status_code=404, detail="Athlete not found")

    if body.race_id and body.heat_id:
        heat = db.get(Heat, body.heat_id)
        if not heat or heat.race_id != body.race_id:
            raise HTTPException(status_code=404, detail="Heat not found")
        real_race = db.get(Race, body.race_id)
        team_id = (real_race.team_id if real_race else None) or coach_team_id
        # Manual PB linked to a real race — auto-approved (admin-visible
        # context: it's a record for this coach's own athlete that flows into HoF).
        result = Result(
            heat_id=body.heat_id,
            athlete_name=athlete.full_name,
            user_id=athlete.id,
            gender=athlete.gender or "M",
            time_seconds=body.time_seconds,
            status="approved",
            created_by=coach.id,
            team_id=team_id,
        )
        db.add(result)
        db.commit()
        if team_id is not None:
            refresh_team_hall_of_fame(db, team_id)
        return {"ok": True, "linked_to_race": True}

    # Manual PBs (hidden race): also auto-approved, since they don't pollute
    # the public race list and they're already scoped to this coach's roster.
    race_name = (body.competition_name or "").strip()
    race = Race(
        name=race_name,
        race_date=date.today(),
        created_by=coach.id,
        is_manual=True,
        status="approved",
        team_id=coach_team_id,
    )
    db.add(race)
    db.flush()
    heat = Heat(
        race_id=race.id,
        distance_m=body.distance_m,
        label=f"{body.distance_m}m",
        team_id=coach_team_id,
    )
    db.add(heat)
    db.flush()
    result = Result(
        heat_id=heat.id,
        athlete_name=athlete.full_name,
        user_id=athlete.id,
        gender=athlete.gender or "M",
        time_seconds=body.time_seconds,
        status="approved",
        created_by=coach.id,
        team_id=coach_team_id,
    )
    db.add(result)
    db.commit()
    if coach_team_id is not None:
        refresh_team_hall_of_fame(db, coach_team_id)
    return {"ok": True, "linked_to_race": False, "race_id": race.id}
