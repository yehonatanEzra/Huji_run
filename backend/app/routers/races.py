from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user, require_coach
from ..models.user import User
from ..models.race import Race, Heat, Result, RaceRegistration, CANONICAL_DISTANCES
from ..schemas.race import (
    RaceCreate, RaceOut, HeatCreate, HeatOut,
    ResultCreate, ResultOut, HeatWithResults, RaceDetail,
    RegistrationCreate, RegistrationUpdate, RegistrationOut,
)
from ..services.time_utils import parse_time, seconds_to_display, format_pace
from ..services.hall_of_fame import refresh_hall_of_fame

router = APIRouter(prefix="/races", tags=["races"])


def _race_status(db: Session, race_id: int) -> str:
    has_result = db.query(Result).join(Heat, Result.heat_id == Heat.id).filter(Heat.race_id == race_id).first()
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
    status_filter: Optional[str] = Query(None, alias="status"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Race)
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
        q = q.filter(func.strftime("%Y", Race.race_date) == str(year))
    races = q.order_by(Race.race_date.desc()).all()
    out = [_attach_race_meta(db, r) for r in races]
    if status_filter in ("upcoming", "completed"):
        out = [r for r in out if r["status"] == status_filter]
    return out


@router.get("/{race_id}", response_model=RaceDetail)
def get_race(race_id: int, db: Session = Depends(get_db), _: User = Depends(get_current_user)):
    race = db.get(Race, race_id)
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")
    return {
        "id": race.id,
        "name": race.name,
        "race_date": race.race_date,
        "heats": [{"id": h.id, "race_id": h.race_id, "distance_m": h.distance_m, "label": h.label} for h in race.heats],
        "status": _race_status(db, race.id),
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
    if target_user_id != current_user.id and current_user.role != "coach":
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
    if user_id != current_user.id and current_user.role != "coach":
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
    if user_id != current_user.id and current_user.role != "coach":
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
    _: User = Depends(get_current_user),
):
    heats = db.query(Heat).filter(Heat.race_id == race_id, Heat.distance_m == distance_m).all()
    output = []
    for heat in heats:
        sorted_results = sorted(heat.results, key=lambda r: r.time_seconds)
        result_outs = []
        for placement, r in enumerate(sorted_results, start=1):
            result_outs.append(ResultOut(
                id=r.id,
                heat_id=r.heat_id,
                athlete_name=r.athlete_name,
                gender=r.gender,
                time_seconds=r.time_seconds,
                time_display=seconds_to_display(r.time_seconds),
                pace_display=format_pace(r.time_seconds, distance_m),
                placement=placement,
            ))
        output.append(HeatWithResults(heat=HeatOut.model_validate(heat), results=result_outs))
    return output


@router.get("/{race_id}/leaderboard")
def get_race_leaderboard(
    race_id: int,
    distance_m: int = Query(...),
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    heats = db.query(Heat).filter(Heat.race_id == race_id, Heat.distance_m == distance_m).all()
    all_results = [r for heat in heats for r in heat.results]

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


# ── Coach write endpoints ──────────────────────────────────────────────────────

@router.post("", response_model=RaceOut, status_code=status.HTTP_201_CREATED)
def create_race(
    body: RaceCreate,
    db: Session = Depends(get_db),
    coach: User = Depends(require_coach),
):
    race = Race(name=body.name.strip(), race_date=body.race_date, created_by=coach.id)
    db.add(race)
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
    heat = db.get(Heat, heat_id)
    if not heat or heat.race_id != race_id:
        raise HTTPException(status_code=404, detail="Heat not found")

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

    result = Result(
        heat_id=heat_id,
        athlete_name=body.athlete_name.strip(),
        user_id=matched_user.id if matched_user else None,
        gender=gender,
        time_seconds=time_sec,
    )
    db.add(result)
    db.flush()

    # Trigger Hall of Fame refresh
    refresh_hall_of_fame(db, heat.distance_m, gender)
    db.commit()
    db.refresh(result)

    # Compute placement within this heat
    siblings = sorted(heat.results, key=lambda r: r.time_seconds)
    placement = next(i + 1 for i, r in enumerate(siblings) if r.id == result.id)

    return ResultOut(
        id=result.id,
        heat_id=result.heat_id,
        athlete_name=result.athlete_name,
        gender=result.gender,
        time_seconds=result.time_seconds,
        time_display=seconds_to_display(result.time_seconds),
        pace_display=format_pace(result.time_seconds, heat.distance_m),
        placement=placement,
    )


@router.patch("/{race_id}", response_model=RaceOut)
def update_race(
    race_id: int,
    body: RaceCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_coach),
):
    race = db.get(Race, race_id)
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")
    race.name = body.name.strip()
    race.race_date = body.race_date
    db.commit()
    db.refresh(race)
    return race


@router.delete("/{race_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_race(race_id: int, db: Session = Depends(get_db), _: User = Depends(require_coach)):
    race = db.get(Race, race_id)
    if not race:
        raise HTTPException(status_code=404, detail="Race not found")
    db.delete(race)
    db.commit()


@router.delete("/{race_id}/heats/{heat_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_heat(
    race_id: int,
    heat_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_coach),
):
    heat = db.get(Heat, heat_id)
    if not heat or heat.race_id != race_id:
        raise HTTPException(status_code=404, detail="Heat not found")
    db.delete(heat)
    db.commit()


@router.patch("/{race_id}/heats/{heat_id}/results/{result_id}")
def update_result(
    race_id: int,
    heat_id: int,
    result_id: int,
    body: ResultCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_coach),
):
    heat = db.get(Heat, heat_id)
    if not heat or heat.race_id != race_id:
        raise HTTPException(status_code=404, detail="Heat not found")
    result = db.get(Result, result_id)
    if not result or result.heat_id != heat_id:
        raise HTTPException(status_code=404, detail="Result not found")

    try:
        time_sec = parse_time(body.time_raw)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))

    matched_user = db.query(User).filter(
        func.lower(User.full_name) == func.lower(body.athlete_name.strip())
    ).first()

    old_gender = result.gender
    result.athlete_name = body.athlete_name.strip()
    result.time_seconds = time_sec
    result.user_id = matched_user.id if matched_user else None
    result.gender = matched_user.gender if matched_user else (body.gender or old_gender)
    db.flush()

    refresh_hall_of_fame(db, heat.distance_m, result.gender)
    if old_gender != result.gender:
        refresh_hall_of_fame(db, heat.distance_m, old_gender)
    db.commit()
    db.refresh(result)

    siblings = sorted(heat.results, key=lambda r: r.time_seconds)
    placement = next(i + 1 for i, r in enumerate(siblings) if r.id == result.id)

    return ResultOut(
        id=result.id,
        heat_id=result.heat_id,
        athlete_name=result.athlete_name,
        gender=result.gender,
        time_seconds=result.time_seconds,
        time_display=seconds_to_display(result.time_seconds),
        pace_display=format_pace(result.time_seconds, heat.distance_m),
        placement=placement,
    )


@router.delete("/{race_id}/heats/{heat_id}/results/{result_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_result(
    race_id: int,
    heat_id: int,
    result_id: int,
    db: Session = Depends(get_db),
    _: User = Depends(require_coach),
):
    heat = db.get(Heat, heat_id)
    if not heat or heat.race_id != race_id:
        raise HTTPException(status_code=404, detail="Heat not found")
    result = db.get(Result, result_id)
    if not result or result.heat_id != heat_id:
        raise HTTPException(status_code=404, detail="Result not found")
    gender = result.gender
    db.delete(result)
    db.flush()
    refresh_hall_of_fame(db, heat.distance_m, gender)
    db.commit()
