"""Read-only AI training assistant for athletes. Grounds an OpenAI chat model in
the athlete's own recent training (planned vs. logged) so it can answer questions
and summarize their week. It cannot change anything."""
from __future__ import annotations
import math
from datetime import datetime, timedelta
from typing import Annotated, Literal, Optional
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..config import settings
from ..services.athlete_context import build_training_digest

router = APIRouter(prefix="/assistant", tags=["assistant"])

MAX_HISTORY = 12          # most-recent messages sent to the model
MAX_MSG_CHARS = 2000      # per-message clamp

# Model tiers. Free (non-premium) athletes always get the cheapest model, capped
# at FREE_LIMIT messages per FREE_WINDOW. Premium athletes get an admin-chosen
# model (from ALLOWED_AI_MODELS) with no cap.
CHEAPEST_MODEL = "gpt-4o-mini"
ALLOWED_AI_MODELS = ("gpt-4o-mini", "gpt-4o")
FREE_LIMIT = 5
FREE_WINDOW = timedelta(hours=48)

SYSTEM_PROMPT = """You are a supportive, knowledgeable running coach's assistant \
for one athlete inside a team-training app. You are given the athlete's recent \
training data: what their coach planned and what they actually logged.

You are given the athlete's recent training data, personal bests, and coach's name.

Rules:
- Prefer the athlete's own data (training, PBs, coach). If a question isn't covered \
by their data, you may still answer from general running knowledge — but say \
clearly that it's general information, not from their own data. Refer to the \
athlete's coach by name when relevant.
- You are read-only: you cannot change workouts, logs, or plans. If the athlete \
wants to change something, tell them to use the app or talk to their coach.
- Do NOT suggest or prescribe specific workouts on your own. ONLY when the athlete \
explicitly asks for a workout or training recommendation may you offer one — and \
present it as an optional idea to run by their coach, never as a replacement for \
the coach's plan.
- You MAY answer health or medical questions, but you MUST begin any such answer \
with a short disclaimer that you are not a medical professional and this is general \
advice, not a diagnosis — and recommend seeing a doctor or physio (and their coach) \
for anything painful or serious.
- Give concise, practical, encouraging answers. Reference specific sessions, dates, \
or PBs when useful.
"""

SUMMARY_REQUEST = (
    "Summarize my last week of training in a few short sentences: what I did vs. "
    "what was planned, how consistent I was, and one encouraging, practical tip. "
    "Keep it brief and friendly."
)


class ChatMessage(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(..., min_length=1)


class ChatRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1)


class ChatResponse(BaseModel):
    reply: str
    premium: bool = False
    remaining: Optional[int] = None  # free messages left in the window; None = unlimited


class CompactRequest(BaseModel):
    messages: list[ChatMessage] = Field(..., min_length=1)


class CompactResponse(BaseModel):
    summary: str


def _require_athlete(user: User) -> None:
    if user.role != "athlete":
        raise HTTPException(status_code=403, detail="The assistant is available to athletes.")


def _model_for(user: User) -> str:
    if user.ai_access and user.ai_model in ALLOWED_AI_MODELS:
        return user.ai_model
    return CHEAPEST_MODEL  # premium with no chosen model, or free tier


def _free_tier_window(user: User, now: datetime) -> tuple[int, datetime]:
    """(messages used, window_start) for the current free window; a stale window
    resets to zero. Not persisted here — the caller commits on success."""
    if user.ai_window_start is None or now - user.ai_window_start >= FREE_WINDOW:
        return 0, now
    return user.ai_msg_count, user.ai_window_start


def _complete(db: Session, athlete: User, history: list[dict]) -> ChatResponse:
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="The AI assistant isn't set up yet.")

    now = datetime.utcnow()
    used, window_start = (0, now)
    if not athlete.ai_access:
        used, window_start = _free_tier_window(athlete, now)
        if used >= FREE_LIMIT:
            hours = max(1, math.ceil((FREE_WINDOW - (now - window_start)).total_seconds() / 3600))
            raise HTTPException(
                status_code=429,
                detail=f"You've used your {FREE_LIMIT} free messages. More in about {hours}h, "
                       f"or ask an admin for premium access.",
            )

    digest = build_training_digest(db, athlete)
    system = f"{SYSTEM_PROMPT}\n\n=== Athlete's recent training ===\n{digest}"
    trimmed = [
        {"role": m["role"], "content": m["content"][:MAX_MSG_CHARS]}
        for m in history[-MAX_HISTORY:]
    ]

    try:
        from openai import OpenAI, OpenAIError
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model=_model_for(athlete),
            messages=[{"role": "system", "content": system}, *trimmed],
            temperature=0.4,
            max_tokens=600,
            timeout=30,
        )
    except OpenAIError:
        raise HTTPException(status_code=502, detail="The assistant is unavailable right now. Try again shortly.")

    reply = (resp.choices[0].message.content or "").strip() or "I couldn't come up with a response. Try rephrasing?"

    if athlete.ai_access:
        return ChatResponse(reply=reply, premium=True, remaining=None)
    # Consume one free message only on success.
    athlete.ai_window_start = window_start
    athlete.ai_msg_count = used + 1
    db.commit()
    return ChatResponse(reply=reply, premium=False, remaining=max(0, FREE_LIMIT - athlete.ai_msg_count))


@router.post("/chat", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    _require_athlete(current_user)
    if body.messages[-1].role != "user":
        raise HTTPException(status_code=422, detail="The last message must be from the user.")
    history = [{"role": m.role, "content": m.content} for m in body.messages]
    return _complete(db, current_user, history)


@router.post("/weekly-summary", response_model=ChatResponse)
def weekly_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    _require_athlete(current_user)
    return _complete(db, current_user, [{"role": "user", "content": SUMMARY_REQUEST}])


@router.post("/compact", response_model=CompactResponse)
def compact(
    body: CompactRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    _db: Annotated[Session, Depends(get_db)],
):
    """Summarize a long conversation into a short brief so the chat can continue
    with far fewer tokens. Uses the cheapest model and does NOT count against the
    free-message quota (it's a housekeeping call, not a user question)."""
    _require_athlete(current_user)
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="The AI assistant isn't set up yet.")
    convo = "\n".join(f"{m.role}: {m.content[:MAX_MSG_CHARS]}" for m in body.messages[-40:])
    prompt = (
        "Summarize this coach-assistant conversation in 2-4 sentences, capturing the "
        "athlete's main questions, key facts about their training, and any advice given, "
        "so the chat can continue with this as context:\n\n" + convo
    )
    try:
        from openai import OpenAI, OpenAIError
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model=CHEAPEST_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=200,
            timeout=30,
        )
    except OpenAIError:
        raise HTTPException(status_code=502, detail="Couldn't summarize the conversation. Try again shortly.")
    return CompactResponse(summary=(resp.choices[0].message.content or "").strip())
