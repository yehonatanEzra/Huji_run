from datetime import date, timedelta
from typing import Annotated, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..models.workout import WorkoutLog
from ..models.race import Result, Heat, Race, CANONICAL_DISTANCES
from ..schemas.stats import (
    KmBucket, KmSeriesResponse,
    PacePoint, PaceDistanceSeries, PaceTrendsResponse,
    WeeklyActivityBucket, WeeklyActivityResponse,
)
from ..services.prescribed_workouts import prescribed_dates, backfill_missed


router = APIRouter(prefix="/stats", tags=["stats"])


# Same week-start convention used in leaderboard._week_start (Sunday).
def _week_start(d: date) -> date:
    return d - timedelta(days=(d.weekday() + 1) % 7)


# Match the labels the Races / Hall of Fame UI already uses.
_DISTANCE_LABELS = {
    1500: "1,500m",
    3000: "3,000m",
    5000: "5,000m",
    10000: "10,000m",
    21100: "Half Marathon",
    42200: "Marathon",
}


def _can_view_athlete(viewer: User, athlete_id: int, db: Session) -> Optional[User]:
    """Return the target athlete User if `viewer` may see their stats, else None.
    Mirrors the visibility rules used elsewhere: self / their coach / admin."""
    athlete = db.get(User, athlete_id)
    if not athlete:
        return None
    if viewer.id == athlete.id:
        return athlete
    if viewer.role == "admin":
        return athlete
    if viewer.role == "coach" and athlete.coach_id == viewer.id:
        return athlete
    return None


@router.get("/{athlete_id}/km-series", response_model=KmSeriesResponse)
def get_km_series(
    athlete_id: int,
    period: str = Query("week", pattern="^(week|month)$"),
    db: Annotated[Session, Depends(get_db)] = ...,
    current_user: Annotated[User, Depends(get_current_user)] = ...,
):
    athlete = _can_view_athlete(current_user, athlete_id, db)
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    today = date.today()

    if period == "week":
        # Last 12 weeks, oldest first. Bucket start = Sunday of that week.
        starts = [_week_start(today) - timedelta(weeks=11 - i) for i in range(12)]
        bucket_for = {s: 0.0 for s in starts}

        earliest = starts[0]
        end_exclusive = starts[-1] + timedelta(days=7)
        rows = (
            db.query(WorkoutLog.date, WorkoutLog.distance_km)
            .filter(
                WorkoutLog.athlete_id == athlete.id,
                WorkoutLog.distance_km.isnot(None),
                WorkoutLog.date >= earliest,
                WorkoutLog.date < end_exclusive,
            )
            .all()
        )
        for d, km in rows:
            ws = _week_start(d)
            if ws in bucket_for:
                bucket_for[ws] += float(km or 0)

        buckets = [
            KmBucket(start=s, label=s.strftime("%b %d"), km=round(bucket_for[s], 1))
            for s in starts
        ]
        return KmSeriesResponse(period="week", buckets=buckets)

    # period == "month"
    # Last 12 months, oldest first. Bucket start = first day of that month.
    starts: list[date] = []
    y, m = today.year, today.month
    for _ in range(12):
        starts.append(date(y, m, 1))
        m -= 1
        if m == 0:
            m = 12
            y -= 1
    starts.reverse()

    def next_month_start(d: date) -> date:
        if d.month == 12:
            return date(d.year + 1, 1, 1)
        return date(d.year, d.month + 1, 1)

    bucket_for = {s: 0.0 for s in starts}
    earliest = starts[0]
    end_exclusive = next_month_start(starts[-1])
    rows = (
        db.query(WorkoutLog.date, WorkoutLog.distance_km)
        .filter(
            WorkoutLog.athlete_id == athlete.id,
            WorkoutLog.distance_km.isnot(None),
            WorkoutLog.date >= earliest,
            WorkoutLog.date < end_exclusive,
        )
        .all()
    )
    for d, km in rows:
        ms = date(d.year, d.month, 1)
        if ms in bucket_for:
            bucket_for[ms] += float(km or 0)

    buckets = [
        KmBucket(start=s, label=s.strftime("%b %y"), km=round(bucket_for[s], 1))
        for s in starts
    ]
    return KmSeriesResponse(period="month", buckets=buckets)


@router.get("/{athlete_id}/pace-trends", response_model=PaceTrendsResponse)
def get_pace_trends(
    athlete_id: int,
    db: Annotated[Session, Depends(get_db)] = ...,
    current_user: Annotated[User, Depends(get_current_user)] = ...,
):
    athlete = _can_view_athlete(current_user, athlete_id, db)
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    # Mirror Hall-of-Fame filters: only approved races + approved results
    # feed the pace history so pending/rejected entries don't pollute trends.
    rows = (
        db.query(Result, Heat, Race)
        .join(Heat, Result.heat_id == Heat.id)
        .join(Race, Heat.race_id == Race.id)
        .filter(
            Result.user_id == athlete.id,
            Result.status == "approved",
            Race.status == "approved",
        )
        .order_by(Race.race_date.asc())
        .all()
    )

    # Group by distance, preserving date order.
    by_distance: dict[int, list[tuple[Result, Heat, Race]]] = {}
    for r, h, race in rows:
        by_distance.setdefault(h.distance_m, []).append((r, h, race))

    series_out: list[PaceDistanceSeries] = []
    # Emit canonical distances first (in the same order the rest of the UI
    # uses), then any others the athlete has raced.
    ordered = [d for d in CANONICAL_DISTANCES if d in by_distance]
    ordered += [d for d in by_distance.keys() if d not in CANONICAL_DISTANCES]

    for dist in ordered:
        entries = by_distance[dist]
        best_so_far: Optional[int] = None
        points: list[PacePoint] = []
        for r, h, race in entries:
            is_pb = best_so_far is None or r.time_seconds < best_so_far
            if is_pb:
                best_so_far = r.time_seconds
            pace = r.time_seconds / (h.distance_m / 1000.0)
            points.append(PacePoint(
                race_date=race.race_date,
                race_name=race.name or "",
                time_seconds=r.time_seconds,
                pace_seconds_per_km=round(pace, 2),
                is_pb=is_pb,
            ))
        series_out.append(PaceDistanceSeries(
            distance_m=dist,
            label=_DISTANCE_LABELS.get(dist, f"{dist}m"),
            points=points,
        ))

    return PaceTrendsResponse(distances=series_out)


# `_prescribed_dates` and `_gw_has_content` / `_it_has_content` used to live
# here. They moved to `services/prescribed_workouts.py` so the calendar
# router can share them for the auto-miss backfill.


@router.get("/{athlete_id}/activity", response_model=WeeklyActivityResponse)
def get_activity(
    athlete_id: int,
    period: str = Query("week", pattern="^(week|month)$"),
    db: Annotated[Session, Depends(get_db)] = ...,
    current_user: Annotated[User, Depends(get_current_user)] = ...,
):
    """Last 12 periods of (running days, completion breakdown, prescribed
    days) for the athlete. Buckets are Sunday-anchored for week or
    1st-of-month for month."""
    athlete = _can_view_athlete(current_user, athlete_id, db)
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")

    today = date.today()

    if period == "week":
        starts = [_week_start(today) - timedelta(weeks=11 - i) for i in range(12)]
        bucket_for = lambda d: _week_start(d)
        end_exclusive = starts[-1] + timedelta(days=7)
        label_fmt = "%b %d"
    else:
        # Month: first-of-month for last 12 months.
        starts = []
        y, m = today.year, today.month
        for _ in range(12):
            starts.append(date(y, m, 1))
            m -= 1
            if m == 0:
                m = 12
                y -= 1
        starts.reverse()
        bucket_for = lambda d: date(d.year, d.month, 1)
        # End-exclusive = first of the month after the last bucket.
        last = starts[-1]
        end_exclusive = date(last.year + 1, 1, 1) if last.month == 12 else date(last.year, last.month + 1, 1)
        label_fmt = "%b %y"

    earliest = starts[0]

    # Auto-mark any prescribed day in the window that's past + unreported.
    # Must run BEFORE the log query so the synthesized rows are picked up.
    backfill_missed(db, athlete, earliest, end_exclusive, today)

    logs = (
        db.query(WorkoutLog.date, WorkoutLog.status, WorkoutLog.distance_km)
        .filter(
            WorkoutLog.athlete_id == athlete.id,
            WorkoutLog.date >= earliest,
            WorkoutLog.date < end_exclusive,
        )
        .all()
    )
    prescribed = prescribed_dates(db, athlete, earliest, end_exclusive)

    bucket_idx = {s: i for i, s in enumerate(starts)}
    accum = [
        {"running_days": 0, "completed": 0, "partial": 0, "missed": 0, "prescribed_days": 0}
        for _ in starts
    ]

    for d, status, km in logs:
        i = bucket_idx.get(bucket_for(d))
        if i is None:
            continue
        if (km or 0) > 0.1:
            accum[i]["running_days"] += 1
        if status == "completed":
            accum[i]["completed"] += 1
        elif status == "partial":
            accum[i]["partial"] += 1
        elif status == "missed":
            accum[i]["missed"] += 1

    for d in prescribed:
        i = bucket_idx.get(bucket_for(d))
        if i is not None:
            accum[i]["prescribed_days"] += 1

    buckets = [
        WeeklyActivityBucket(
            start=s,
            label=s.strftime(label_fmt),
            **accum[i],
        )
        for i, s in enumerate(starts)
    ]
    return WeeklyActivityResponse(buckets=buckets)
