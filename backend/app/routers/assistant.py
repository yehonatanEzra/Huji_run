"""Read-only AI training assistant for athletes. Grounds an OpenAI chat model in
the athlete's own recent training (planned vs. logged) so it can answer questions
and summarize their week. It cannot change anything."""
from __future__ import annotations
from typing import Annotated, Literal
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

SYSTEM_PROMPT = """You are a supportive, knowledgeable running coach's assistant \
for one athlete inside a team-training app. You are given the athlete's recent \
training data: what their coach planned and what they actually logged.

Rules:
- Use ONLY the training data provided. If something isn't in the data, say you \
don't have that information rather than inventing it.
- You are read-only: you cannot change workouts, logs, or plans. If the athlete \
wants to change something, tell them to use the app or talk to their coach.
- Give concise, practical, encouraging answers. Reference specific sessions/dates \
when useful.
- You are not a doctor. For pain, injury, or health concerns, advise them to rest \
and consult their coach or a medical professional; don't diagnose or prescribe.
- Defer to the athlete's actual coach; frame suggestions as ideas to discuss, not \
orders that override the coach's plan.
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


def _require_athlete(user: User) -> None:
    if user.role != "athlete":
        raise HTTPException(status_code=403, detail="The assistant is available to athletes.")
    if not user.ai_access:
        raise HTTPException(status_code=403, detail="The AI assistant isn't enabled for your account.")


def _complete(db: Session, athlete: User, history: list[dict]) -> str:
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="The AI assistant isn't set up yet.")

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
            model=settings.OPENAI_MODEL,
            messages=[{"role": "system", "content": system}, *trimmed],
            temperature=0.4,
            max_tokens=600,
            timeout=30,
        )
    except OpenAIError:
        raise HTTPException(status_code=502, detail="The assistant is unavailable right now. Try again shortly.")

    reply = (resp.choices[0].message.content or "").strip()
    return reply or "I couldn't come up with a response. Try rephrasing?"


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
    return ChatResponse(reply=_complete(db, current_user, history))


@router.post("/weekly-summary", response_model=ChatResponse)
def weekly_summary(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    _require_athlete(current_user)
    return ChatResponse(reply=_complete(db, current_user, [{"role": "user", "content": SUMMARY_REQUEST}]))
