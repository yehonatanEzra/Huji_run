import time
from datetime import datetime, timezone
from typing import Annotated, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
import httpx
from sqlalchemy.orm import Session
from ..config import settings
from ..database import get_db
from ..dependencies import get_current_user, require_coach
from ..models.user import User

router = APIRouter(prefix="/strava", tags=["strava"])

STRAVA_AUTH_URL = "https://www.strava.com/oauth/authorize"
STRAVA_TOKEN_URL = "https://www.strava.com/oauth/token"
STRAVA_ACTIVITIES_URL = "https://www.strava.com/api/v3/athlete/activities"


def _ensure_fresh_token(user: User, db: Session) -> str:
    """Return a valid access token, refreshing it first if it's about to expire."""
    if user.strava_token_expires_at and user.strava_token_expires_at > time.time() + 60:
        return user.strava_access_token
    r = httpx.post(STRAVA_TOKEN_URL, data={
        "client_id": settings.STRAVA_CLIENT_ID,
        "client_secret": settings.STRAVA_CLIENT_SECRET,
        "grant_type": "refresh_token",
        "refresh_token": user.strava_refresh_token,
    })
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
    r = httpx.get(STRAVA_ACTIVITIES_URL, headers={"Authorization": f"Bearer {access_token}"},
                  params={"after": after, "before": before, "per_page": 20})
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


@router.get("/connect-url")
def get_connect_url(current_user: Annotated[User, Depends(get_current_user)]):
    """Return the Strava OAuth URL the frontend should redirect the user to."""
    if not settings.STRAVA_CLIENT_ID:
        raise HTTPException(status_code=503, detail="Strava integration is not configured")
    url = (
        f"{STRAVA_AUTH_URL}"
        f"?client_id={settings.STRAVA_CLIENT_ID}"
        f"&redirect_uri={settings.STRAVA_REDIRECT_URI}"
        f"&response_type=code"
        f"&scope=read,activity:read_all"
        f"&state={current_user.id}"
        f"&approval_prompt=auto"
    )
    return {"url": url}


@router.get("/callback")
def strava_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
    db: Session = Depends(get_db),
):
    """Strava redirects here after the user authorizes the app."""
    frontend_profile = f"{settings.FRONTEND_URL}/profile"
    if error or not code or not state:
        return RedirectResponse(url=f"{frontend_profile}?strava=error")
    try:
        user_id = int(state)
        user = db.get(User, user_id)
        if not user:
            return RedirectResponse(url=f"{frontend_profile}?strava=error")
        r = httpx.post(STRAVA_TOKEN_URL, data={
            "client_id": settings.STRAVA_CLIENT_ID,
            "client_secret": settings.STRAVA_CLIENT_SECRET,
            "code": code,
            "grant_type": "authorization_code",
        })
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
        raise HTTPException(status_code=502, detail=f"Strava API error: {e.response.status_code}")
    except Exception as e:
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
        raise HTTPException(status_code=502, detail=f"Strava API error: {e.response.status_code}")
    except Exception:
        raise HTTPException(status_code=502, detail="Could not fetch Strava activities")
