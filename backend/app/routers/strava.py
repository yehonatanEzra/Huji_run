import base64
import logging
import time
from datetime import datetime, timezone, timedelta, date as date_type
from typing import Annotated, List, Optional
from urllib.parse import urlencode
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
import httpx
from sqlalchemy.orm import Session
from ..config import settings
from ..database import get_db
from ..dependencies import get_current_user, require_coach
from ..models.user import User
from ..models.workout import WorkoutLog

logger = logging.getLogger(__name__)

STRAVA_HTTP_TIMEOUT = 15.0


def _encode_state(user_id: int, origin: Optional[str]) -> str:
    """Encode user_id + frontend origin as a URL-safe state string."""
    raw = f"{user_id}|{origin or ''}"
    return base64.urlsafe_b64encode(raw.encode()).decode().rstrip('=')


def _decode_state(state: str) -> tuple[Optional[int], Optional[str]]:
    """Decode a state string back into (user_id, origin). Falls back to
    treating the whole string as a bare user_id integer for legacy callbacks."""
    if not state:
        return None, None
    # Legacy: state might just be the user_id as an int
    try:
        return int(state), None
    except ValueError:
        pass
    try:
        padding = '=' * ((4 - len(state) % 4) % 4)
        decoded = base64.urlsafe_b64decode((state + padding).encode()).decode()
        parts = decoded.split('|', 1)
        user_id = int(parts[0])
        origin = parts[1] if len(parts) > 1 and parts[1] else None
        return user_id, origin
    except Exception:
        return None, None

router = APIRouter(prefix="/strava", tags=["strava"])

STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities"

# Sport types that count toward the running km total. Other types (Walk, Ride,
# Swim, etc.) still appear in the per-day Strava list — they just don't get
# summed into the workout_log distance. Future activity-type counters can use
# their own filter sets.
RUN_SPORT_TYPES = {"Run", "TrailRun", "VirtualRun", "Treadmill"}


def _is_run(activity: dict) -> bool:
    """True if a Strava activity is a running activity (counts toward km)."""
    sport = activity.get("sport_type") or activity.get("type", "")
    return sport in RUN_SPORT_TYPES


def _ensure_fresh_token(user: User, db: Session) -> str:
    """Return a valid access token, refreshing it first if it's about to expire."""
    if user.strava_token_expires_at and user.strava_token_expires_at > time.time() + 60:
        return user.strava_access_token
    r = httpx.post(
        STRAVA_TOKEN_URL,
        data={
            "client_id": settings.STRAVA_CLIENT_ID,
            "client_secret": settings.STRAVA_CLIENT_SECRET,
            "grant_type": "refresh_token",
            "refresh_token": user.strava_refresh_token,
        },
        timeout=STRAVA_HTTP_TIMEOUT,
    )
    r.raise_for_status()
    d = r.json()
    user.strava_access_token = d["access_token"]
    user.strava_refresh_token = d["refresh_token"]
    user.strava_token_expires_at = d["expires_at"]
    db.commit()
    return user.strava_access_token


def _fetch_activities_for_date(access_token: str, date_str: str) -> list:
    """Fetch Strava activities for a single calendar day (local date string yyyy-MM-dd)."""
    day = datetime.strptime(date_str, "%Y-%m-%d").replace(tzinfo=timezone.utc)
    after = int(day.timestamp())
    before = after + 86400
    r = httpx.get(
        STRAVA_ACTIVITIES_URL,
        headers={"Authorization": f"Bearer {access_token}"},
        params={"after": after, "before": before, "per_page": 20},
        timeout=STRAVA_HTTP_TIMEOUT,
    )
    r.raise_for_status()
    results = []
    for a in r.json():
        results.append({
            "id": a["id"],
            "name": a["name"],
            "type": a.get("sport_type") or a.get("type", "Run"),
            "distance_m": a.get("distance", 0),
            "moving_time_s": a.get("moving_time", 0),
            "start_date_local": a.get("start_date_local", ""),
        })
    return results


def _fetch_activity_detail(access_token: str, activity_id: int) -> dict:
    """Fetch one Strava activity in full detail. Includes splits, laps, best efforts."""
    r = httpx.get(
        f"https://www.strava.com/api/v3/activities/{activity_id}",
        headers={"Authorization": f"Bearer {access_token}"},
        params={"include_all_efforts": "true"},
        timeout=STRAVA_HTTP_TIMEOUT,
    )
    r.raise_for_status()
    a = r.json()

    splits = [
        {
            "split": s.get("split"),
            "distance_m": s.get("distance", 0),
            "moving_time_s": s.get("moving_time", 0),
            "elevation_diff_m": s.get("elevation_difference", 0),
            "average_heartrate": s.get("average_heartrate"),
        }
        for s in (a.get("splits_metric") or [])
    ]
    laps = [
        {
            "lap_index": lap.get("lap_index"),
            "distance_m": lap.get("distance", 0),
            "moving_time_s": lap.get("moving_time", 0),
            "average_speed_ms": lap.get("average_speed", 0),
            "average_heartrate": lap.get("average_heartrate"),
            "average_cadence": lap.get("average_cadence"),
        }
        for lap in (a.get("laps") or [])
    ]
    best_efforts = [
        {
            "name": be.get("name"),
            "elapsed_time_s": be.get("elapsed_time", 0),
            "distance_m": be.get("distance", 0),
            "is_pr": be.get("pr_rank") == 1,
        }
        for be in (a.get("best_efforts") or [])
    ]

    return {
        "id": a.get("id"),
        "name": a.get("name"),
        "description": a.get("description"),
        "type": a.get("sport_type") or a.get("type", "Run"),
        "distance_m": a.get("distance", 0),
        "moving_time_s": a.get("moving_time", 0),
        "elapsed_time_s": a.get("elapsed_time", 0),
        "total_elevation_gain_m": a.get("total_elevation_gain", 0),
        "average_speed_ms": a.get("average_speed", 0),
        "max_speed_ms": a.get("max_speed"),
        "average_heartrate": a.get("average_heartrate"),
        "max_heartrate": a.get("max_heartrate"),
        "average_cadence": a.get("average_cadence"),
        "calories": a.get("calories"),
        "start_date_local": a.get("start_date_local", ""),
        "splits": splits,
        "laps": laps,
        "best_efforts": best_efforts,
    }


@router.get("/connect-url")
def get_connect_url(
    current_user: Annotated[User, Depends(get_current_user)],
    origin: Optional[str] = Query(None, description="Frontend origin to redirect back to after OAuth"),
):
    """Return the Strava OAuth URL the frontend should redirect the user to.

    The optional `origin` query param lets the frontend tell us where to
    redirect after the OAuth dance — useful for local dev where the frontend
    runs on multiple ports (5173 / 5174 / etc.).
    """
    if not settings.STRAVA_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Strava integration is not configured")
    state = _encode_state(current_user.id, origin)
    # Strava requires the redirect_uri to be URL-encoded. Use urlencode for all
    # params so colons, slashes, commas, and base64 padding are encoded safely.
    params = urlencode({
        "client_id": settings.STRAVA_CLIENT_ID,
        "redirect_uri": settings.STRAVA_REDIRECT_URI,
        "response_type": "code",
        "approval_prompt": "auto",
        "scope": "read,activity:read_all",
        "state": state,
    })
    return {"url": f"{STRAVA_AUTH_URL}?{params}"}


@router.get("/callback")
def strava_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Strava redirects here after the user authorizes the app."""
    user_id, origin = _decode_state(state) if state else (None, None)
    frontend_url = origin or settings.FRONTEND_URL
    frontend_profile = f"{frontend_url}/profile"

    if error or not code or not user_id:
        return RedirectResponse(url=f"{frontend_profile}?strava=error")
    try:
        user = db.get(User, user_id)
        if not user:
            return RedirectResponse(url=f"{frontend_profile}?strava=error")
        r = httpx.post(
            STRAVA_TOKEN_URL,
            data={
                "client_id": settings.STRAVA_CLIENT_ID,
                "client_secret": settings.STRAVA_CLIENT_SECRET,
                "code": code,
                "grant_type": "authorization_code",
            },
            timeout=STRAVA_HTTP_TIMEOUT,
        )
        r.raise_for_status()
        d = r.json()
        user.strava_athlete_id = d["athlete"]["id"]
        user.strava_access_token = d["access_token"]
        user.strava_refresh_token = d["refresh_token"]
        user.strava_token_expires_at = d["expires_at"]
        db.commit()
        return RedirectResponse(url=f"{frontend_profile}?strava=connected")
    except Exception:
        return RedirectResponse(url=f"{frontend_profile}?strava=error")


@router.delete("/disconnect")
def disconnect_strava(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    current_user.strava_athlete_id = None
    current_user.strava_access_token = None
    current_user.strava_refresh_token = None
    current_user.strava_token_expires_at = None
    db.commit()
    return {"ok": True}


@router.get("/activities/{athlete_id}")
def get_athlete_activities(
    athlete_id: int,
    date: str = Query(..., description="Date in yyyy-MM-dd format"),
    db: Annotated[Session, Depends(get_db)] = ...,
    _coach: Annotated[User, Depends(require_coach)] = ...,
):
    """Coach-only: fetch an athlete's Strava activities for a given date."""
    athlete = db.get(User, athlete_id)
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    if not athlete.strava_access_token:
        raise HTTPException(status_code=409, detail="Athlete has not connected Strava")
    try:
        token = _ensure_fresh_token(athlete, db)
        return _fetch_activities_for_date(token, date)
    except httpx.HTTPStatusError as e:
        if e.response.status_code in (400, 401):
            raise HTTPException(status_code=409, detail="Athlete's Strava connection expired")
        raise HTTPException(status_code=502, detail=f"Strava API error: {e.response.status_code}")
    except Exception:
        logger.exception("Coach Strava activities fetch failed (athlete %s)", athlete_id)
        raise HTTPException(status_code=502, detail="Could not fetch Strava activities")


@router.get("/my-activities")
def get_my_activities(
    date: str = Query(..., description="Date in yyyy-MM-dd format"),
    current_user: Annotated[User, Depends(get_current_user)] = ...,
    db: Annotated[Session, Depends(get_db)] = ...,
):
    """Fetch the current user's own Strava activities for a given date."""
    if not current_user.strava_access_token:
        raise HTTPException(status_code=409, detail="You have not connected Strava")
    try:
        token = _ensure_fresh_token(current_user, db)
        return _fetch_activities_for_date(token, date)
    except httpx.HTTPStatusError as e:
        if e.response.status_code in (400, 401):
            raise HTTPException(
                status_code=409,
                detail="Strava connection expired — please reconnect from your Profile.",
            )
        raise HTTPException(status_code=502, detail=f"Strava API error: {e.response.status_code}")
    except Exception:
        logger.exception("My Strava activities fetch failed (user %s)", current_user.id)
        raise HTTPException(status_code=502, detail="Could not fetch Strava activities")


@router.get("/my-activity/{activity_id}")
def get_my_activity_detail(
    activity_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Detailed view of one of the current user's Strava activities (splits, laps, etc.)."""
    if not current_user.strava_access_token:
        raise HTTPException(status_code=409, detail="You have not connected Strava")
    try:
        token = _ensure_fresh_token(current_user, db)
        return _fetch_activity_detail(token, activity_id)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Activity not found on Strava")
        raise HTTPException(status_code=502, detail=f"Strava API error: {e.response.status_code}")
    except Exception:
        logger.exception("My Strava activity detail failed (user %s, activity %s)", current_user.id, activity_id)
        raise HTTPException(status_code=502, detail="Could not fetch Strava activity")


@router.get("/activity/{athlete_id}/{activity_id}")
def get_athlete_activity_detail(
    athlete_id: int,
    activity_id: int,
    db: Annotated[Session, Depends(get_db)],
    _coach: Annotated[User, Depends(require_coach)],
):
    """Coach-only: detailed view of one of an athlete's Strava activities."""
    athlete = db.get(User, athlete_id)
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    if not athlete.strava_access_token:
        raise HTTPException(status_code=409, detail="Athlete has not connected Strava")
    try:
        token = _ensure_fresh_token(athlete, db)
        return _fetch_activity_detail(token, activity_id)
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 404:
            raise HTTPException(status_code=404, detail="Activity not found on Strava")
        raise HTTPException(status_code=502, detail=f"Strava API error: {e.response.status_code}")
    except Exception:
        logger.exception("Coach Strava activity detail failed (athlete %s, activity %s)", athlete_id, activity_id)
        raise HTTPException(status_code=502, detail="Could not fetch Strava activity")


@router.post("/sync")
def sync_strava(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    days: int = Query(14, ge=1, le=90, description="How many days back to sync"),
):
    """
    Fetch Strava activities for the last N days and create/update workout logs.
    This endpoint is designed to be idempotent and safe to call multiple times.
    """
    # Validate that the current user has connected their Strava account
    if not current_user.strava_access_token:
        raise HTTPException(status_code=409, detail="Strava is not connected")

    # Securely calculate UTC timestamps based on system time.
    # Using time.time() prevents 500 errors caused by server-side timezone differences.
    now_ts = int(time.time())
    seconds_back = days * 86400  # 86400 seconds in a day
    
    after = now_ts - seconds_back
    before = now_ts + 86400  # 1-day safety buffer forward to avoid missing today's activities

    try:
        token = _ensure_fresh_token(current_user, db)
        r = httpx.get(
            STRAVA_ACTIVITIES_URL,
            headers={"Authorization": f"Bearer {token}"},
            params={"after": after, "before": before, "per_page": 100},
            timeout=STRAVA_HTTP_TIMEOUT,
        )
        r.raise_for_status()
        activities = r.json()
    except httpx.HTTPStatusError as e:
        logger.warning("Strava sync HTTP error for user %s: %s %s", current_user.id, e.response.status_code, e.response.text[:300])
        if e.response.status_code in (400, 401):
            raise HTTPException(
                status_code=409,
                detail="Strava connection expired — please reconnect from your Profile.",
            )
        raise HTTPException(status_code=502, detail=f"Strava API error: {e.response.status_code}")
    except Exception:
        logger.exception("Strava sync failed for user %s", current_user.id)
        raise HTTPException(status_code=502, detail="Could not reach Strava")

    # Group activities by local date (the first 10 characters represent yyyy-MM-dd)
    by_date: dict[str, list] = {}
    for a in activities:
        local = a.get("start_date_local", "")
        if len(local) < 10:
            continue
        by_date.setdefault(local[:10], []).append(a)

    # Process data and update the database
    created = 0
    updated = 0
    skipped = 0
    skipped_non_run_days = 0
    
    for date_str, acts in by_date.items():
        day = datetime.strptime(date_str, "%Y-%m-%d").date()

        # Filter: Only running activities count toward the running km total.
        # Days with non-run activities only (Walk, Ride, Swim) get skipped for logs.
        run_acts = [a for a in acts if _is_run(a)]
        if not run_acts:
            skipped_non_run_days += 1
            continue

        # Calculate total distance in km (Strava returns distance in meters)
        total_km = sum(a.get("distance", 0) for a in run_acts) / 1000.0
        
        # Build the notes string summarizing activity names and distances
        parts = [
            f"{a.get('name', 'Activity')} ({a.get('distance', 0) / 1000:.1f}km)"
            for a in run_acts
        ]
        notes = "Strava: " + " · ".join(parts)

        # Check if a workout log already exists for this athlete on this date
        log = db.query(WorkoutLog).filter(
            WorkoutLog.athlete_id == current_user.id,
            WorkoutLog.date == day,
        ).first()

        # If manual override is enabled, skip to avoid overwriting coach/user changes
        if log and log.manual_override:
            skipped += 1
            continue

        # Update existing log or create a brand new WorkoutLog entry
        if log:
            log.status = "completed"
            log.completed = True
            log.distance_km = round(total_km, 2)
            log.notes = notes
            updated += 1
        else:
            db.add(WorkoutLog(
                athlete_id=current_user.id,
                date=day,
                status="completed",
                completed=True,
                distance_km=round(total_km, 2),
                notes=notes,
            ))
            created += 1

    # Commit all changes to the database
    db.commit()
    
    # 6. Return sync statistics payload back to the frontend
    return {
        "activities": len(activities),
        "days_with_activity": len(by_date),
        "created": created,
        "updated": updated,
        "skipped_manual": skipped,
        "skipped_non_run_days": skipped_non_run_days,
    }