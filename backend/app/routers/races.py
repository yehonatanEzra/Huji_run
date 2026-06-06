from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, extract
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user, require_coach, require_admin, get_active_team_id
from ..models.user import User
from ..models.race import Race, Heat, Result, RaceRegistration, CANONICAL_DISTANCES
from ..schemas.race import (
    RaceCreate, RaceOut, HeatCreate, HeatRename, HeatOut,
    ResultCreate, ResultOut, HeatWithResults, RaceDetail,
    RegistrationCreate, RegistrationUpdate, RegistrationOut,
)
from ..services.time_utils import parse_time, seconds_to_display, format_pace
from ..services.hall_of_fame import refresh_team_hall_of_fame
from ..services.notifications import notify_many

router = APIRouter(prefix="/races", tags=["races"])


# ── Moderation helpers ────────────────────────────────────────────────────────


def _can_see_race(user: User, race: Race) -> bool:
    """A pending race is visible only to its author + admins. Approved + manual
    races are visible to everyone. Rejected races are visible only to the
    author + admins (so the coach can see admin's note on their drafts)."""
    if race.status == "approved":
        return True
    if user.role == "admin":
        return True
    return race.created_by == user.id


def _can_modify_race(user: User, race: Race) -> bool:
    if user.role == "admin":
        return True
    return race.created_by == user.id and race.status in ("pending", "rejected")


def _can_see_result(user: User, race: Race, result: Result) -> bool:
    """Approved results visible to all (once the race itself is visible).
    Pending/rejected results visible only to the proposing coach + admins."""
    if not _can_see_race(user, race):
        return False
    if result.status == "approved":
        return True
    if user.role == "admin":
        return True
    return result.created_by == user.id


def _can_modify_result(user: User, result: Result) -> bool:
    if user.role == "admin":
        return True
    return result.created_by == user.id and result.status in ("pending", "rejected")


def _race_status(db: Session, race_id: int) -> str:
    has_result = (
        db.query(Result)
        .join(Heat, Result.heat_id == Heat.id)
        .filter(Heat.race_id == race_id, Result.status == "approved")
        .first()
    )
    return "completed" if has_result else "upcoming"


def _attach_race_meta(db: Session, race: Race) -> dict:
    status_val = _race_status(db, race.id)
    reg_count = db.query(func.count(RaceRegistration.id)).filter(RaceRegistration.race_id == race.id).scalar() or 0
    heat_count = db.query(func.count(Heat.id)).filter(Heat.race_id == race.id).scalar() or 0
    return {
        "id": race.id,
        "name": race.name,
        "race_date": race.race_date,
        "status": status_val,
        "registration_count": reg_count,
        "heat_count": heat_count,
    }


@router.get("", response_model=list[RaceOut])
def list_races(
    search: Optional[str] = Query(None),
    year: Optional[int] = Query(None),
    mine: bool = Query(False),
    drafts: bool = Query(False),
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Race).filter(Race.is_manual == False)  # noqa: E712
    # Moderation visibility: approved races are public; pending/rejected races
    # are visible only to their author + admins.
    if drafts:
        # Show only "my pending + rejected" races (used by the coach drafts tab).
        if current_user.role == "admin":
            q = q.filter(Race.status.in_(("pending", "rejected")))
        else:
            q = q.filter(Race.status.in_(("pending", "rejected")), Race.created_by == current_user.id)
    elif current_user.role == "admin":
        pass  # admins can see all races by default
    else:
        # Approved races for everyone, plus the caller's own pending/rejected.
        q = q.filter(
            (Race.status == "approved")
            | (Race.created_by == current_user.id)
        )
    if mine:
        result_race_ids = (
            db.query(Heat.race_id)
            .join(Result, Result.heat_id == Heat.id)
            .filter(Result.user_id == current_user.id)
            .distinct()
        )
        registered_race_ids = (
            db.query(RaceRegistration.race_id)
            .filter(RaceRegistration.user_id == current_user.id)
            .distinct()
        )
        my_ids = {r[0] for r in result_race_ids.all()} | {r[0] for r in registered_race_ids.all()}
        q = q.filter(Race.id.in_(my_ids))
    if search:
        q = q.filter(Race.name.ilike(f"%{search}%"))
    if year:
        q = q.filter(extract("year", Race.race_date) == year)
    races = q.order_by(Race.race_date.desc()).all()
    out = []
    for r in races:
        meta = _attach_race_meta(db, r)
        meta["moderation_status"] = r.status
        meta["decline_note"] = r.decline_note
        out.append(meta)
    if status_filter in ("upcoming", "completed"):
        out = [r for r in out if r["status"] == status_filter]
    return out


@router.get("/{race_id}", response_model=RaceDetail)
def get_race(race_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user)):
    race = db.get(Race, race_id)
    if not race or not _can_see_race(current_user, race):
        raise HTTPException(status_code=404, detail="Race not found")
    return {
        "id": race.id,
        "name": race.name,
        "race_date": race.race_date,
        "heats": [{"id": h.id, "race_id": h.race_id, "distance_m": h.distance_m, "label": h.label} for h in race.heats],
        "status": _race_status(db, race.id),
        "moderation_status": race.status,
        "decline_note": race.decline_note,
        "created_by": race.created_by,
    }


@router.get("/{race_id}/registrations", response_model=list[RegistrationOut])
def list_registrations(
    race_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    race = db.get(Race, race_id)
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")
    regs = (
        db.query(RaceRegistration)
        .filter(RaceRegistration.race_id == race_id)
        .order_by(RaceRegistration.registered_at.asc())
        .all()
    )
    out = []
    for r in regs:
        out.append({
            "id": r.id,
            "user_id": r.user_id,
            "athlete_name": r.user.full_name,
            "heat_id": r.heat_id,
            "heat_label": r.heat.label if r.heat else None,
            "heat_distance_m": r.heat.distance_m if r.heat else None,
            "registered_at": r.registered_at.isoformat(),
        })
    return out


@router.post("/{race_id}/registrations", response_model=RegistrationOut, status_code=status.HTTP_201_CREATED)
def create_registration(
    race_id: int,
    payload: RegistrationCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    race = db.get(Race, race_id)
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")

    target_user_id = payload.user_id or current_user.id
    if target_user_id != current_user.id and current_user.role not in ("coach", "admin"):
        raise HTTPException(status_code=403, detail="Only coaches can register others")

    target = db.get(User, target_user_id)
    if not target:
        raise HTTPException(status_code=404, detail="Athlete not found")

    if payload.heat_id is not None:
        heat = db.get(Heat, payload.heat_id)
        if not heat or heat.race_id != race_id:
            raise HTTPException(status_code=400, detail="Heat does not belong to this race")

    existing = db.query(RaceRegistration).filter(
        RaceRegistration.race_id == race_id,
        RaceRegistration.user_id == target_user_id,
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail="Already registered. Update instead.")

    reg = RaceRegistration(
        race_id=race_id,
        user_id=target_user_id,
        heat_id=payload.heat_id,
        registered_by=current_user.id,
    )
    db.add(reg)
    db.commit()
    db.refresh(reg)
    return {
        "id": reg.id,
        "user_id": reg.user_id,
        "athlete_name": target.full_name,
        "heat_id": reg.heat_id,
        "heat_label": reg.heat.label if reg.heat else None,
        "heat_distance_m": reg.heat.distance_m if reg.heat else None,
        "registered_at": reg.registered_at.isoformat(),
    }


@router.put("/{race_id}/registrations/{user_id}", response_model=RegistrationOut)
def update_registration(
    race_id: int,
    user_id: int,
    payload: RegistrationUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if user_id != current_user.id and current_user.role not in ("coach", "admin"):
        raise HTTPException(status_code=403, detail="Only coaches can update others' registrations")

    reg = db.query(RaceRegistration).filter(
        RaceRegistration.race_id == race_id,
        RaceRegistration.user_id == user_id,
    ).first()
    if not reg:
        raise HTTPException(status_code=404, detail="Registration not found")

    if payload.heat_id is not None:
        heat = db.get(Heat, payload.heat_id)
        if not heat or heat.race_id != race_id:
            raise HTTPException(status_code=400, detail="Heat does not belong to this race")

    reg.heat_id = payload.heat_id
    db.commit()
    db.refresh(reg)
    return {
        "id": reg.id,
        "user_id": reg.user_id,
        "athlete_name": reg.user.full_name,
        "heat_id": reg.heat_id,
        "heat_label": reg.heat.label if reg.heat else None,
        "heat_distance_m": reg.heat.distance_m if reg.heat else None,
        "registered_at": reg.registered_at.isoformat(),
    }


@router.delete("/{race_id}/registrations/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_registration(
    race_id: int,
    user_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    if user_id != current_user.id and current_user.role not in ("coach", "admin"):
        raise HTTPException(status_code=403, detail="Only coaches can remove others")
    reg = db.query(RaceRegistration).filter(
        RaceRegistration.race_id == race_id,
        RaceRegistration.user_id == user_id,
    ).first()
    if not reg:
        return
    db.delete(reg)
    db.commit()


@router.get("/{race_id}/results", response_model=list[HeatWithResults])
def get_race_results(
    race_id: int,
    distance_m: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    race = db.get(Race, race_id)
    if not race or not _can_see_race(current_user, race):
        raise HTTPException(status_code=404, detail="Race not found")
    heats = db.query(Heat).filter(Heat.race_id == race_id, Heat.distance_m == distance_m).all()
    output = []
    for heat in heats:
        # Drop results the caller isn't allowed to see (e.g. another coach's pending).
        visible_results = [r for r in heat.results if _can_see_result(current_user, race, r)]
        sorted_results = sorted(visible_results, key=lambda r: r.time_seconds)
        result_outs = []
        # Placement is computed on APPROVED results only (so a pending result
        # doesn't bump someone's official placement).
        approved_sorted = sorted([r for r in visible_results if r.status == "approved"], key=lambda r: r.time_seconds)
        approved_placement = {r.id: i + 1 for i, r in enumerate(approved_sorted)}
        for r in sorted_results:
            result_outs.append(ResultOut(
                id=r.id,
                heat_id=r.heat_id,
                athlete_name=r.athlete_name,
                gender=r.gender,
                time_seconds=r.time_seconds,
                time_display=seconds_to_display(r.time_seconds),
                pace_display=format_pace(r.time_seconds, distance_m),
                placement=approved_placement.get(r.id),
                moderation_status=r.status,
                decline_note=r.decline_note,
                created_by=r.created_by,
            ))
        output.append(HeatWithResults(heat=HeatOut.model_validate(heat), results=result_outs))
    return output


@router.get("/{race_id}/leaderboard")
def get_race_leaderboard(
    race_id: int,
    distance_m: int = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    race = db.get(Race, race_id)
    if not race or not _can_see_race(current_user, race):
        raise HTTPException(status_code=404, detail="Race not found")
    heats = db.query(Heat).filter(Heat.race_id == race_id, Heat.distance_m == distance_m).all()
    # Leaderboard reflects approved results only — pending entries shouldn't
    # disturb official rankings.
    all_results = [r for heat in heats for r in heat.results if r.status == "approved"]

    def build_board(gender: str):
        filtered = sorted(
            [r for r in all_results if r.gender == gender],
            key=lambda r: r.time_seconds
        )
        return [
            {
                "placement": i + 1,
                "athlete_name": r.athlete_name,
                "time_display": seconds_to_display(r.time_seconds),
                "pace_display": format_pace(r.time_seconds, distance_m),
                "time_seconds": r.time_seconds,
            }
            for i, r in enumerate(filtered)
        ]

    return {"men": build_board("M"), "women": build_board("F")}


# ── Coach + Admin write endpoints (with moderation) ──────────────────────────

@router.post("", response_model=RaceOut, status_code=status.HTTP_201_CREATED)
def create_race(
    body: RaceCreate,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
    active_team_id: Optional[int] = Depends(get_active_team_id),
):
    """Admin creates approved races directly; coaches create pending races
    that need admin approval before going public."""
    race = Race(
        name=body.name.strip(),
        race_date=body.race_date,
        created_by=coach.id,
        status="approved" if coach.role == "admin" else "pending",
        team_id=active_team_id,
    )
    db.add(race)
    db.flush()

    # Notify all athletes once the race is publicly visible (approved races only).
    if race.status == "approved":
        athlete_ids = [r[0] for r in db.query(User.id).filter(User.role == "athlete").all()]
        notify_many(
            db, athlete_ids, "new_race",
            f"New race: {race.name} on {race.race_date.strftime('%b %d, %Y')}",
            f"/races/{race.id}",
        )

    db.commit()
    db.refresh(race)
    return race


@router.post("/{race_id}/heats", response_model=HeatOut, status_code=status.HTTP_201_CREATED)
def add_heat(
    race_id: int,
    body: HeatCreate,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
):
    race = db.get(Race, race_id)
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")
    # Coaches can add heats only to their own pending/rejected races. Admin
    # can add heats to any race.
    if not _can_modify_race(coach, race):
        raise HTTPException(status_code=403, detail="You can't add heats to this race")
    heat = Heat(race_id=race_id, distance_m=body.distance_m, label=body.label.strip())
    db.add(heat)
    db.commit()
    db.refresh(heat)
    return heat


@router.post("/{race_id}/heats/{heat_id}/results", response_model=ResultOut, status_code=status.HTTP_201_CREATED)
def add_result(
    race_id: int,
    heat_id: int,
    body: ResultCreate,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
):
    race = db.get(Race, race_id)
    heat = db.get(Heat, heat_id)
    if not race or not heat or heat.race_id != race_id:
        raise HTTPException(status_code=404, detail="Heat not found")
    if not _can_see_race(coach, race):
        raise HTTPException(status_code=404, detail="Race not found")

    try:
        time_sec = parse_time(body.time_raw)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    # Resolve athlete name to registered user
    matched_user = db.query(User).filter(
        func.lower(User.full_name) == func.lower(body.athlete_name.strip())
    ).first()

    gender = matched_user.gender if matched_user else body.gender
    if gender is None:
        raise HTTPException(
            status_code=422,
            detail="Gender must be provided when athlete name doesn't match a registered user"
        )

    new_status = "approved" if coach.role == "admin" else "pending"
    result = Result(
        heat_id=heat_id,
        athlete_name=body.athlete_name.strip(),
        user_id=matched_user.id if matched_user else None,
        gender=gender,
        time_seconds=time_sec,
        status=new_status,
        created_by=coach.id,
        team_id=race.team_id,
    )
    db.add(result)
    db.flush()

    # Refresh HoF only when the result is actually approved.
    if new_status == "approved" and race.team_id is not None:
        refresh_team_hall_of_fame(db, race.team_id)
    db.commit()
    db.refresh(result)

    # Compute placement within this heat (approved only).
    approved = sorted([r for r in heat.results if r.status == "approved"], key=lambda r: r.time_seconds)
    placement = next((i + 1 for i, r in enumerate(approved) if r.id == result.id), None)

    return ResultOut(
        id=result.id,
        heat_id=result.heat_id,
        athlete_name=result.athlete_name,
        gender=result.gender,
        time_seconds=result.time_seconds,
        time_display=seconds_to_display(result.time_seconds),
        pace_display=format_pace(result.time_seconds, heat.distance_m),
        placement=placement,
        moderation_status=result.status,
        decline_note=result.decline_note,
        created_by=result.created_by,
    )


@router.patch("/{race_id}", response_model=RaceOut)
def update_race(
    race_id: int,
    body: RaceCreate,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
):
    race = db.get(Race, race_id)
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")
    if not _can_modify_race(coach, race):
        raise HTTPException(status_code=403, detail="Approved races can only be edited by admin")
    race.name = body.name.strip()
    race.race_date = body.race_date
    # An edit to a rejected race puts it back into the review queue.
    if race.status == "rejected" and coach.role != "admin":
        race.status = "pending"
        race.decline_note = None
        race.decided_at = None
        race.decided_by = None
    db.commit()
    db.refresh(race)
    return race


@router.delete("/{race_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_race(race_id: int, db: Session = Depends(get_db), coach: User = Depends(require_coach)):
    race = db.get(Race, race_id)
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")
    if not _can_modify_race(coach, race):
        raise HTTPException(status_code=403, detail="Approved races can only be deleted by admin")
    db.delete(race)
    db.commit()


@router.delete("/{race_id}/heats/{heat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_heat(
    race_id: int,
    heat_id: int,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
):
    heat = db.get(Heat, heat_id)
    if not heat or heat.race_id != race_id:
        raise HTTPException(status_code=404, detail="Heat not found")
    race = db.get(Race, race_id)
    if not _can_modify_race(coach, race):
        raise HTTPException(status_code=403, detail="Can't modify heats on an approved race")
    db.delete(heat)
    db.commit()


@router.patch("/{race_id}/heats/{heat_id}", response_model=HeatOut)
def rename_heat(
    race_id: int,
    heat_id: int,
    body: HeatRename,
    db: Session = Depends(get_db),
    admin: User = Depends(require_admin),
):
    heat = db.get(Heat, heat_id)
    if not heat or heat.race_id != race_id:
        raise HTTPException(status_code=404, detail="Heat not found")
    new_label = body.label.strip()
    if not new_label:
        raise HTTPException(status_code=422, detail="Label cannot be empty")
    heat.label = new_label
    db.commit()
    db.refresh(heat)
    return heat


@router.patch("/{race_id}/heats/{heat_id}/results/{result_id}")
def update_result(
    race_id: int,
    heat_id: int,
    result_id: int,
    body: ResultCreate,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
):
    heat = db.get(Heat, heat_id)
    if not heat or heat.race_id != race_id:
        raise HTTPException(status_code=404, detail="Heat not found")
    result = db.get(Result, result_id)
    if not result or result.heat_id != heat_id:
        raise HTTPException(status_code=404, detail="Result not found")
    if not _can_modify_result(coach, result):
        raise HTTPException(status_code=403, detail="You can only edit your own pending results")

    try:
        time_sec = parse_time(body.time_raw)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    matched_user = db.query(User).filter(
        func.lower(User.full_name) == func.lower(body.athlete_name.strip())
    ).first()

    old_gender = result.gender
    was_approved = result.status == "approved"
    result.athlete_name = body.athlete_name.strip()
    result.time_seconds = time_sec
    result.user_id = matched_user.id if matched_user else None
    result.gender = matched_user.gender if matched_user else (body.gender or old_gender)
    # Coach edit on a rejected result puts it back into pending review.
    if result.status == "rejected" and coach.role != "admin":
        result.status = "pending"
        result.decline_note = None
        result.decided_at = None
        result.decided_by = None
    db.flush()

    # Only refresh HoF if the result was/is approved (admin edits live data).
    if was_approved or result.status == "approved":
        race = db.get(Race, heat.race_id)
        if race and race.team_id is not None:
            refresh_team_hall_of_fame(db, race.team_id)
    db.commit()
    db.refresh(result)

    approved = sorted([r for r in heat.results if r.status == "approved"], key=lambda r: r.time_seconds)
    placement = next((i + 1 for i, r in enumerate(approved) if r.id == result.id), None)

    return ResultOut(
        id=result.id,
        heat_id=result.heat_id,
        athlete_name=result.athlete_name,
        gender=result.gender,
        time_seconds=result.time_seconds,
        time_display=seconds_to_display(result.time_seconds),
        pace_display=format_pace(result.time_seconds, heat.distance_m),
        placement=placement,
        moderation_status=result.status,
        decline_note=result.decline_note,
        created_by=result.created_by,
    )


@router.delete("/{race_id}/heats/{heat_id}/results/{result_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_result(
    race_id: int,
    heat_id: int,
    result_id: int,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
):
    heat = db.get(Heat, heat_id)
    if not heat or heat.race_id != race_id:
        raise HTTPException(status_code=404, detail="Heat not found")
    result = db.get(Result, result_id)
    if not result or result.heat_id != heat_id:
        raise HTTPException(status_code=404, detail="Result not found")
    if not _can_modify_result(coach, result):
        raise HTTPException(status_code=403, detail="You can only delete your own pending results")
    gender = result.gender
    distance_m = heat.distance_m
    race = db.get(Race, race_id)
    was_approved = result.status == "approved"
    db.delete(result)
    db.flush()
    # If this was the last result on a manual-PB race, clean up the orphan race+heat
    if race and race.is_manual:
        remaining = db.query(Result).join(Heat, Result.heat_id == Heat.id).filter(Heat.race_id == race_id).count()
        if remaining == 0:
            db.delete(race)  # cascades to heats
    if was_approved and race and race.team_id is not None:
        refresh_team_hall_of_fame(db, race.team_id)
    db.commit()
