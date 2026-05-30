from __future__ import annotations
from datetime import date
from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import func as sa_func
from ..database import get_db
from ..dependencies import get_current_user, require_coach, require_admin
from ..models.user import User
from ..models.challenge import Challenge
from ..models.workout import WorkoutLog
from ..models.race import Result, Heat, Race
from ..schemas.challenge import ChallengeCreate, ChallengeOut, ChallengeDetail, LeaderboardEntry

router = APIRouter(prefix="/challenges", tags=["challenges"])


def _fmt_time(seconds):
    h, rem = divmod(int(seconds), 3600)
    m, s = divmod(rem, 60)
    if h:
        return f"{h}:{m:02d}:{s:02d}"
    return f"{m}:{s:02d}"


def _challenge_out(ch: Challenge) -> dict:
    today = date.today()
    remaining = max(0, (ch.end_date - today).days)
    return {
        **{c.key: getattr(ch, c.key) for c in Challenge.__table__.columns},
        "days_remaining": remaining,
        "is_active": ch.start_date <= today <= ch.end_date,
    }


def _compute_leaderboard(ch: Challenge, db: Session, current_user_id: int) -> ChallengeDetail:
    out = _challenge_out(ch)
    leaderboard = []

    group_athlete_ids = None
    if ch.training_group_id:
        group_athlete_ids = [
            uid for (uid,) in db.query(User.id).filter(
                User.training_group_id == ch.training_group_id,
                User.role == "athlete",
            ).all()
        ]

    if ch.challenge_type == "total_km":
        q = db.query(
            WorkoutLog.athlete_id,
            sa_func.sum(WorkoutLog.distance_km).label("total"),
        ).filter(
            WorkoutLog.date >= ch.start_date,
            WorkoutLog.date <= ch.end_date,
            WorkoutLog.distance_km != None,
            WorkoutLog.distance_km > 0,
        )
        if group_athlete_ids is not None:
            q = q.filter(WorkoutLog.athlete_id.in_(group_athlete_ids))
        rows = q.group_by(WorkoutLog.athlete_id).order_by(sa_func.sum(WorkoutLog.distance_km).desc()).all()

        for rank, (athlete_id, total) in enumerate(rows, 1):
            user = db.get(User, athlete_id)
            leaderboard.append(LeaderboardEntry(
                rank=rank,
                athlete_name=user.full_name if user else "Unknown",
                value=round(total, 1),
                value_display=f"{round(total, 1)} km",
            ))

    elif ch.challenge_type == "best_time" and ch.target_distance_m:
        q = db.query(
            Result.user_id,
            sa_func.min(Result.time_seconds).label("best"),
        ).join(Heat).join(Race).filter(
            Heat.distance_m == ch.target_distance_m,
            Race.race_date >= ch.start_date,
            Race.race_date <= ch.end_date,
            Result.user_id != None,
        )
        if group_athlete_ids is not None:
            q = q.filter(Result.user_id.in_(group_athlete_ids))
        rows = q.group_by(Result.user_id).order_by(sa_func.min(Result.time_seconds).asc()).all()

        for rank, (user_id, best) in enumerate(rows, 1):
            user = db.get(User, user_id)
            leaderboard.append(LeaderboardEntry(
                rank=rank,
                athlete_name=user.full_name if user else "Unknown",
                value=best,
                value_display=_fmt_time(best),
            ))

    my_rank = None
    my_value = None
    for entry in leaderboard:
        if entry.athlete_name == (db.get(User, current_user_id).full_name if db.get(User, current_user_id) else ""):
            my_rank = entry.rank
            my_value = entry.value
            break

    return ChallengeDetail(**out, leaderboard=leaderboard, my_rank=my_rank, my_value=my_value)


@router.get("", response_model=List[ChallengeOut])
def list_challenges(
    status: str = Query(default="active"),
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    today = date.today()
    q = db.query(Challenge)

    # Scoping:
    #   - Admin: sees all challenges.
    #   - Coach: sees global challenges + challenges scoped to one of their groups.
    #   - Athlete: sees global challenges + their own group's.
    if current_user.role == "admin":
        pass  # no filter
    elif current_user.role == "coach":
        from ..models.training_group import TrainingGroup
        my_group_ids = [g.id for g in db.query(TrainingGroup).filter(TrainingGroup.coach_id == current_user.id).all()]
        if my_group_ids:
            q = q.filter(
                (Challenge.training_group_id == None) |
                (Challenge.training_group_id.in_(my_group_ids))
            )
        else:
            q = q.filter(Challenge.training_group_id == None)
    else:
        q = q.filter(
            (Challenge.training_group_id == None) |
            (Challenge.training_group_id == current_user.training_group_id)
        )

    if status == "active":
        q = q.filter(Challenge.start_date <= today, Challenge.end_date >= today)
    elif status == "past":
        q = q.filter(Challenge.end_date < today)

    challenges = q.order_by(Challenge.end_date.desc()).all()
    return [_challenge_out(ch) for ch in challenges]


@router.get("/{challenge_id}", response_model=ChallengeDetail)
def get_challenge(
    challenge_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    ch = db.get(Challenge, challenge_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Not found")
    # Visibility: global challenges (training_group_id is None) are open to all.
    # Group challenges: admin sees any; coach sees challenges scoped to their
    # own group; athlete sees their own group only.
    if ch.training_group_id is not None and current_user.role != "admin":
        from ..models.training_group import TrainingGroup
        if current_user.role == "coach":
            grp = db.get(TrainingGroup, ch.training_group_id)
            if not grp or grp.coach_id != current_user.id:
                raise HTTPException(status_code=404, detail="Not found")
        else:  # athlete
            if ch.training_group_id != current_user.training_group_id:
                raise HTTPException(status_code=404, detail="Not found")
    return _compute_leaderboard(ch, db, current_user.id)


@router.post("", response_model=ChallengeOut, status_code=201)
def create_challenge(
    body: ChallengeCreate,
    coach: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if body.challenge_type not in ("total_km", "best_time"):
        raise HTTPException(status_code=400, detail="Type must be total_km or best_time")
    ch = Challenge(
        name=body.name,
        description=body.description,
        challenge_type=body.challenge_type,
        target_distance_m=body.target_distance_m,
        target_km=body.target_km,
        start_date=body.start_date,
        end_date=body.end_date,
        training_group_id=body.training_group_id,
        created_by=coach.id,
    )
    db.add(ch)
    db.commit()
    db.refresh(ch)
    return _challenge_out(ch)


@router.delete("/{challenge_id}", status_code=204)
def delete_challenge(
    challenge_id: int,
    coach: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    ch = db.get(Challenge, challenge_id)
    if not ch:
        raise HTTPException(status_code=404, detail="Not found")
    db.delete(ch)
    db.commit()
