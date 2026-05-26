from datetime import date, timedelta
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from sqlalchemy import func as sa_func
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import require_coach
from ..models.user import User
from ..models.training_group import TrainingGroup
from ..models.workout import GroupWorkout, IndividualTarget, WorkoutLog
from ..models.race import Race, Heat, Result
from ..schemas.auth import UserOut
from ..schemas.workout import CoachDashboardResponse, AthleteWeekRow, WorkoutLogOut, IndividualTargetOut, GroupWorkoutOut


class UpdateAthleteName(BaseModel):
    full_name: str


class TrainingGroupCreate(BaseModel):
    name: str


class TrainingGroupOut(BaseModel):
    id: int
    name: str
    member_count: int = 0
    model_config = {"from_attributes": True}


class TrainingGroupDetail(BaseModel):
    id: int
    name: str
    members: list[UserOut]
    model_config = {"from_attributes": True}


class AssignAthleteBody(BaseModel):
    athlete_id: int


router = APIRouter(prefix="/coach", tags=["coach"])


def _week_start(d: date) -> date:
    return d - timedelta(days=(d.weekday() + 1) % 7)


# ── Training Groups ──────────────────────────────────────────────────────────

@router.get("/groups", response_model=list[TrainingGroupOut])
def list_groups(
    db: Session = Depends(get_db),
    _: User = Depends(require_coach),
):
    groups = db.query(TrainingGroup).order_by(TrainingGroup.name).all()
    return [
        TrainingGroupOut(id=g.id, name=g.name, member_count=len(g.members))
        for g in groups
    ]


@router.post("/groups", response_model=TrainingGroupOut, status_code=201)
def create_group(
    body: TrainingGroupCreate,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
):
    g = TrainingGroup(name=body.name.strip(), created_by=coach.id)
    db.add(g)
    db.commit()
    db.refresh(g)
    return TrainingGroupOut(id=g.id, name=g.name, member_count=0)


@router.get("/groups/{group_id}", response_model=TrainingGroupDetail)
def get_group(
    group_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_coach),
):
    g = db.get(TrainingGroup, group_id)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    return TrainingGroupDetail(id=g.id, name=g.name, members=g.members)


@router.patch("/groups/{group_id}", response_model=TrainingGroupOut)
def rename_group(
    group_id: int,
    body: TrainingGroupCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_coach),
):
    g = db.get(TrainingGroup, group_id)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    g.name = body.name.strip()
    db.commit()
    db.refresh(g)
    return TrainingGroupOut(id=g.id, name=g.name, member_count=len(g.members))


@router.delete("/groups/{group_id}", status_code=204)
def delete_group(
    group_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_coach),
):
    g = db.get(TrainingGroup, group_id)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    for member in g.members:
        member.training_group_id = None
    db.delete(g)
    db.commit()


@router.post("/groups/{group_id}/members", status_code=200)
def add_member_to_group(
    group_id: int,
    body: AssignAthleteBody,
    db: Session = Depends(get_db),
    _: User = Depends(require_coach),
):
    g = db.get(TrainingGroup, group_id)
    if not g:
        raise HTTPException(status_code=404, detail="Group not found")
    athlete = db.get(User, body.athlete_id)
    if not athlete or athlete.role != "athlete":
        raise HTTPException(status_code=404, detail="Athlete not found")
    athlete.training_group_id = group_id
    db.commit()
    return {"ok": True}


@router.delete("/groups/{group_id}/members/{athlete_id}", status_code=204)
def remove_member_from_group(
    group_id: int,
    athlete_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_coach),
):
    athlete = db.get(User, athlete_id)
    if not athlete or athlete.training_group_id != group_id:
        raise HTTPException(status_code=404, detail="Athlete not in this group")
    athlete.training_group_id = None
    db.commit()


# ── Athletes ─────────────────────────────────────────────────────────────────

@router.get("/athletes", response_model=list[UserOut])
def list_athletes(
    db: Annotated[Session, Depends(get_db)],
    _: Annotated[User, Depends(require_coach)],
):
    return db.query(User).filter(User.role == "athlete").order_by(User.full_name).all()


@router.get("/athletes/search")
def search_athletes(
    q: str = Query(..., min_length=1),
    db: Session = Depends(get_db),
    _: User = Depends(require_coach),
):
    results = (
        db.query(User)
        .filter(User.role == "athlete", User.full_name.ilike(f"{q}%"))
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

    athletes = db.query(User).filter(User.role == "athlete").order_by(User.full_name).all()

    logs = db.query(WorkoutLog).filter(WorkoutLog.date.in_(week_dates)).all()
    log_map: dict[tuple, WorkoutLog] = {(l.athlete_id, l.date): l for l in logs}

    targets = db.query(IndividualTarget).filter(IndividualTarget.date.in_(week_dates)).all()
    target_map: dict[tuple, IndividualTarget] = {(t.athlete_id, t.date): t for t in targets}

    group_workouts = db.query(GroupWorkout).filter(GroupWorkout.date.in_(week_dates)).all()
    gw_map: dict[tuple, GroupWorkout] = {(gw.training_group_id, gw.date): gw for gw in group_workouts}

    # Preload recipient targeting once for all this-week workouts
    from ..models.workout import GroupWorkoutRecipient
    gw_ids = [gw.id for gw in group_workouts]
    gw_recipients: dict[int, set[int]] = {}
    if gw_ids:
        for gid, aid in db.query(GroupWorkoutRecipient.group_workout_id, GroupWorkoutRecipient.athlete_id).filter(
            GroupWorkoutRecipient.group_workout_id.in_(gw_ids)
        ).all():
            gw_recipients.setdefault(gid, set()).add(aid)

    group_map = {g.id: g.name for g in db.query(TrainingGroup).all()}

    from ..models.kudos import Kudos
    from ..routers.kudos import ALLOWED_EMOJI as KUDOS_EMOJI
    log_ids = [l.id for l in logs]
    per_log_counts: dict[int, dict[str, int]] = {}
    per_log_mine: dict[int, set[str]] = {}
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

    rows = []
    for athlete in athletes:
        days = []
        for d in week_dates:
            log = log_map.get((athlete.id, d))
            target = target_map.get((athlete.id, d))
            gw = gw_map.get((athlete.training_group_id, d)) if athlete.training_group_id else None
            # Targeting: if gw has explicit recipients and this athlete isn't in the set, hide it
            if gw:
                rec_set = gw_recipients.get(gw.id)
                if rec_set and athlete.id not in rec_set:
                    gw = None
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
            days.append({
                "date": d,
                "log": log_out,
                "target": IndividualTargetOut.model_validate(target) if target else None,
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


@router.patch("/athletes/{athlete_id}", response_model=UserOut)
def update_athlete(
    athlete_id: int,
    body: UpdateAthleteName,
    db: Session = Depends(get_db),
    _: User = Depends(require_coach),
):
    athlete = db.get(User, athlete_id)
    if not athlete or athlete.role != "athlete":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Athlete not found")
    athlete.full_name = body.full_name.strip()
    db.commit()
    db.refresh(athlete)
    return athlete


@router.delete("/athletes/{athlete_id}", status_code=204)
def delete_athlete(
    athlete_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_coach),
):
    athlete = db.get(User, athlete_id)
    if not athlete or athlete.role != "athlete":
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Athlete not found")
    from ..models.hall_of_fame import HallOfFame
    from ..models.kudos import Kudos
    from ..models.feed import Announcement, AnnouncementReaction, AnnouncementComment
    from ..models.race import RaceRegistration
    from ..models.health_wellness import HealthProfessional, HealthReview
    from ..services.hall_of_fame import refresh_hall_of_fame

    # Workout-related
    workout_log_ids = [l.id for l in db.query(WorkoutLog).filter(WorkoutLog.athlete_id == athlete_id).all()]
    if workout_log_ids:
        db.query(Kudos).filter(Kudos.workout_log_id.in_(workout_log_ids)).delete(synchronize_session=False)
    db.query(WorkoutLog).filter(WorkoutLog.athlete_id == athlete_id).delete()
    db.query(IndividualTarget).filter(IndividualTarget.athlete_id == athlete_id).delete()

    # Kudos this user gave to others
    db.query(Kudos).filter(Kudos.giver_id == athlete_id).delete()

    # Feed activity
    db.query(AnnouncementReaction).filter(AnnouncementReaction.user_id == athlete_id).delete()
    db.query(AnnouncementComment).filter(AnnouncementComment.user_id == athlete_id).delete()
    # If the athlete authored any announcements, delete them (cascades reactions/comments via FK)
    for ann in db.query(Announcement).filter(Announcement.author_id == athlete_id).all():
        db.query(AnnouncementReaction).filter(AnnouncementReaction.announcement_id == ann.id).delete()
        db.query(AnnouncementComment).filter(AnnouncementComment.announcement_id == ann.id).delete()
        db.delete(ann)

    # Race registrations (both as athlete and as the one who registered someone)
    db.query(RaceRegistration).filter(RaceRegistration.user_id == athlete_id).delete()
    db.query(RaceRegistration).filter(RaceRegistration.registered_by == athlete_id).delete()

    # Health & Wellness reviews and professionals they created
    db.query(HealthReview).filter(HealthReview.user_id == athlete_id).delete()
    # Re-assign professionals they created to the deleting coach so listings stay intact
    db.query(HealthProfessional).filter(HealthProfessional.created_by_id == athlete_id).update(
        {HealthProfessional.created_by_id: _.id}, synchronize_session=False
    )

    # Race results — track Hall of Fame distances to refresh
    athlete_results = db.query(Result).filter(Result.user_id == athlete_id).all()
    hof_refresh = set()
    for r in athlete_results:
        heat = db.get(Heat, r.heat_id)
        if heat:
            hof_refresh.add((heat.distance_m, r.gender))
        db.delete(r)
    db.query(HallOfFame).filter(HallOfFame.user_id == athlete_id).delete()

    db.delete(athlete)
    db.commit()
    for distance_m, gender in hof_refresh:
        refresh_hall_of_fame(db, distance_m, gender)


@router.get("/athletes/{athlete_id}/profile")
def get_athlete_profile(
    athlete_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_coach),
):
    athlete = db.get(User, athlete_id)
    if not athlete or athlete.role != "athlete":
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
    if not athlete or athlete.role != "athlete":
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
    ).all()
    target_map = {t.date: t for t in targets}

    gw_map = {}
    if athlete.training_group_id:
        gws = db.query(GroupWorkout).filter(
            GroupWorkout.training_group_id == athlete.training_group_id,
            GroupWorkout.date.in_(week_dates),
        ).all()
        # Apply per-athlete targeting
        from ..models.workout import GroupWorkoutRecipient
        gw_ids = [g.id for g in gws]
        recip: dict[int, set[int]] = {}
        if gw_ids:
            for gid, aid in db.query(GroupWorkoutRecipient.group_workout_id, GroupWorkoutRecipient.athlete_id).filter(
                GroupWorkoutRecipient.group_workout_id.in_(gw_ids)
            ).all():
                recip.setdefault(gid, set()).add(aid)
        for gw in gws:
            rec_set = recip.get(gw.id)
            if rec_set and athlete_id not in rec_set:
                continue
            gw_map[gw.date] = gw

    from ..models.kudos import Kudos
    from ..routers.kudos import ALLOWED_EMOJI as KUDOS_EMOJI
    log_ids = [l.id for l in logs]
    per_log_counts: dict[int, dict[str, int]] = {}
    per_log_mine: dict[int, set[str]] = {}
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
        }

    days = []
    for d in week_dates:
        log = log_map.get(d)
        target = target_map.get(d)
        gw = gw_map.get(d)
        days.append({
            "date": d.isoformat(),
            "log": _log_payload(log) if log else None,
            "target": {
                "note": target.note,
                "override_group": target.override_group,
                "workout_type": target.workout_type,
                "title": target.title,
                "warmup": target.warmup,
                "main_session": target.main_session,
                "cooldown": target.cooldown,
            } if target else None,
            "group_workout": {
                "content": gw.content,
                "workout_type": gw.workout_type,
                "title": gw.title,
                "warmup": gw.warmup,
                "main_session": gw.main_session,
                "cooldown": gw.cooldown,
            } if gw and (gw.content or gw.warmup or gw.main_session or gw.cooldown) else None,
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
):
    from ..services.hall_of_fame import refresh_hall_of_fame

    athlete = db.get(User, athlete_id)
    if not athlete or athlete.role != "athlete":
        raise HTTPException(status_code=404, detail="Athlete not found")

    if body.race_id and body.heat_id:
        heat = db.get(Heat, body.heat_id)
        if not heat or heat.race_id != body.race_id:
            raise HTTPException(status_code=404, detail="Heat not found")
        result = Result(
            heat_id=body.heat_id,
            athlete_name=athlete.full_name,
            user_id=athlete.id,
            gender=athlete.gender or "M",
            time_seconds=body.time_seconds,
        )
        db.add(result)
        db.commit()
        refresh_hall_of_fame(db, heat.distance_m, result.gender)
        return {"ok": True, "linked_to_race": True}

    # Manual PBs: race exists only to anchor the Result+Heat for HoF.
    # If the coach didn't provide a competition name, leave the race name empty
    # so the profile UI shows just "distance · time · date" with no source label.
    race_name = (body.competition_name or "").strip()
    race = Race(
        name=race_name,
        race_date=date.today(),
        created_by=coach.id,
        is_manual=True,
    )
    db.add(race)
    db.flush()
    heat = Heat(
        race_id=race.id,
        distance_m=body.distance_m,
        label=f"{body.distance_m}m",
    )
    db.add(heat)
    db.flush()
    result = Result(
        heat_id=heat.id,
        athlete_name=athlete.full_name,
        user_id=athlete.id,
        gender=athlete.gender or "M",
        time_seconds=body.time_seconds,
    )
    db.add(result)
    db.commit()
    refresh_hall_of_fame(db, body.distance_m, result.gender)
    return {"ok": True, "linked_to_race": False, "race_id": race.id}
