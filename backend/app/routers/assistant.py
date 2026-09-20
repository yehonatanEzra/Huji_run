"""AI running-coach assistant for athletes. A conversation is persisted in the
DB; each turn the model is grounded in a lean base prompt (profile, PBs, last 7
days, and — premium only — the athlete's notebook) and can call read-only tools
(get_load / get_log / get_race_history) to pull deeper history on demand.

Free tier: gpt-4o-mini, capped messages per rolling window, no tools, no notebook.
Premium (ai_access): gpt-4o, unlimited, all tools, notebook. Read-only throughout."""
from __future__ import annotations
import json
import math
from datetime import datetime, timedelta
from typing import Annotated, Optional
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import get_db
from ..dependencies import get_current_user
from ..models.user import User
from ..models.assistant import AssistantConversation, AssistantMessage, AthleteNotebook
from ..config import settings
from ..services.assistant_context import build_base_prompt
from ..services.assistant_tools import tool_schemas, execute_tool
from ..services.assistant_prompts import get_prompt
from ..services.assistant_summarizer import maybe_summarize, SUMMARIZE_THRESHOLD_TOKENS

router = APIRouter(prefix="/assistant", tags=["assistant"])

CHEAPEST_MODEL = "gpt-4o-mini"
PREMIUM_DEFAULT_MODEL = "gpt-4o"
ALLOWED_AI_MODELS = ("gpt-4o-mini", "gpt-4o")

FREE_LIMIT = 10
FREE_WINDOW = timedelta(hours=48)

MAX_TOOL_DEPTH = 5        # tool-call rounds before we force a final answer
MAX_HISTORY_MSGS = 20     # prior stored turns replayed to the model
NOTEBOOK_MAX_CHARS = 1500


def _require_athlete(user: User) -> None:
    if user.role != "athlete":
        raise HTTPException(status_code=403, detail="The assistant is available to athletes.")


def _model_for(user: User) -> str:
    if user.ai_access:
        return user.ai_model if user.ai_model in ALLOWED_AI_MODELS else PREMIUM_DEFAULT_MODEL
    return CHEAPEST_MODEL


def _est_tokens(text: str) -> int:
    return max(1, len(text) // 4)


# ── schemas ───────────────────────────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str = Field(..., min_length=1, max_length=2000)
    conversation_id: Optional[int] = None


class ChatResponse(BaseModel):
    conversation_id: int
    reply: str
    premium: bool = False
    remaining: Optional[int] = None       # free messages left in the window; None = unlimited
    tools_used: list[str] = Field(default_factory=list)


class MessageOut(BaseModel):
    id: int
    role: str
    content: str
    tool_name: Optional[str] = None
    created_at: datetime

    model_config = {"from_attributes": True}


class ConversationOut(BaseModel):
    id: int
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


# ── free-tier window ──────────────────────────────────────────────────────────

def _free_window(user: User, now: datetime) -> tuple[int, datetime]:
    """(messages used, window_start) for the current free window; a stale window
    resets to zero. Not persisted here — the caller commits on success."""
    if user.ai_window_start is None or now - user.ai_window_start >= FREE_WINDOW:
        return 0, now
    return user.ai_msg_count, user.ai_window_start


# ── endpoints ─────────────────────────────────────────────────────────────────

def _get_or_create_conversation(db: Session, athlete: User, conversation_id: Optional[int]) -> AssistantConversation:
    if conversation_id is not None:
        conv = db.get(AssistantConversation, conversation_id)
        if conv is None or conv.athlete_id != athlete.id:
            raise HTTPException(status_code=404, detail="Conversation not found.")
        return conv
    conv = AssistantConversation(athlete_id=athlete.id)
    db.add(conv)
    db.flush()  # assign id
    return conv


@router.post("/chat", response_model=ChatResponse)
def chat(
    body: ChatRequest,
    background_tasks: BackgroundTasks,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    _require_athlete(current_user)
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="The AI assistant isn't set up yet.")

    premium = bool(current_user.ai_access)

    # Free-tier gate.
    now = datetime.utcnow()
    used, window_start = (0, now)
    if not premium:
        used, window_start = _free_window(current_user, now)
        if used >= FREE_LIMIT:
            hours = max(1, math.ceil((FREE_WINDOW - (now - window_start)).total_seconds() / 3600))
            raise HTTPException(
                status_code=429,
                detail=f"You've used your {FREE_LIMIT} free messages. More in about {hours}h, "
                       f"or ask an admin for premium access.",
            )

    conv = _get_or_create_conversation(db, current_user, body.conversation_id)

    # Persist the user's message.
    db.add(AssistantMessage(conversation_id=conv.id, role="user", content=body.message))

    # Replay prior turns (user/assistant text only — tool rounds run fresh).
    prior = [
        m for m in db.query(AssistantMessage)
        .filter(AssistantMessage.conversation_id == conv.id, AssistantMessage.role.in_(("user", "assistant")))
        .order_by(AssistantMessage.id.asc())
        .all()
    ][-MAX_HISTORY_MSGS:]

    base = build_base_prompt(db, current_user, include_notebook=premium)
    messages: list[dict] = [{"role": "system", "content": base}]
    if conv.summary:
        messages.append({"role": "system", "content": f"Summary of earlier conversation: {conv.summary}"})
    for m in prior:
        messages.append({"role": m.role, "content": m.content})
    messages.append({"role": "user", "content": body.message})

    tools = tool_schemas(db) if premium else None
    model = _model_for(current_user)

    reply, tools_used = _run_model(db, current_user, conv, messages, tools, model)

    # Persist the final assistant message.
    db.add(AssistantMessage(conversation_id=conv.id, role="assistant", content=reply))

    # Rough running token count on the conversation (used by Sprint 2 summarizer).
    conv.token_count = (conv.token_count or 0) + _est_tokens(body.message) + _est_tokens(reply)

    remaining: Optional[int] = None
    if not premium:
        current_user.ai_window_start = window_start
        current_user.ai_msg_count = used + 1
        remaining = max(0, FREE_LIMIT - current_user.ai_msg_count)

    db.commit()

    # Compact the conversation in the background once it grows large.
    if (conv.token_count or 0) >= SUMMARIZE_THRESHOLD_TOKENS:
        background_tasks.add_task(maybe_summarize, conv.id)

    return ChatResponse(
        conversation_id=conv.id, reply=reply, premium=premium,
        remaining=remaining, tools_used=tools_used,
    )


def _run_model(db, athlete, conv, messages, tools, model) -> tuple[str, list[str]]:
    """Run the chat completion, resolving up to MAX_TOOL_DEPTH tool-call rounds.
    Persists each tool result as an AssistantMessage. Returns (reply, tools_used)."""
    from openai import OpenAI, OpenAIError
    client = OpenAI(api_key=settings.OPENAI_API_KEY)
    tools_used: list[str] = []

    try:
        for _ in range(MAX_TOOL_DEPTH):
            kwargs = dict(model=model, messages=messages, temperature=0.4, max_tokens=800, timeout=45)
            if tools:  # omit entirely for free tier — the SDK sends `"tools": null` otherwise
                kwargs["tools"] = tools
            resp = client.chat.completions.create(**kwargs)
            choice = resp.choices[0].message
            if not choice.tool_calls:
                return (
                    (choice.content or "").strip() or "I couldn't come up with a response. Try rephrasing?",
                    tools_used,
                )
            # Echo the assistant's tool-call turn, then resolve each call.
            messages.append({
                "role": "assistant",
                "content": choice.content or "",
                "tool_calls": [
                    {"id": tc.id, "type": "function",
                     "function": {"name": tc.function.name, "arguments": tc.function.arguments}}
                    for tc in choice.tool_calls
                ],
            })
            for tc in choice.tool_calls:
                try:
                    args = json.loads(tc.function.arguments or "{}")
                except json.JSONDecodeError:
                    args = {}
                result = execute_tool(tc.function.name, args, db, athlete)
                tools_used.append(tc.function.name)
                db.add(AssistantMessage(
                    conversation_id=conv.id, role="tool",
                    content=result, tool_name=tc.function.name,
                ))
                # Count tool output toward the summarizer trigger — these can be
                # large (get_log) and would otherwise never move token_count.
                conv.token_count = (conv.token_count or 0) + _est_tokens(result)
                messages.append({"role": "tool", "tool_call_id": tc.id, "content": result})

        # Ran out of tool rounds — force a final answer without tools.
        resp = client.chat.completions.create(
            model=model, messages=messages, temperature=0.4, max_tokens=800, timeout=45,
        )
        return (
            (resp.choices[0].message.content or "").strip() or "I couldn't come up with a response. Try rephrasing?",
            tools_used,
        )
    except OpenAIError:
        raise HTTPException(status_code=502, detail="The assistant is unavailable right now. Try again shortly.")


class NotebookOut(BaseModel):
    content: str
    updated_at: Optional[datetime] = None


class NotebookUpdate(BaseModel):
    content: str = Field(..., max_length=NOTEBOOK_MAX_CHARS)


def _upsert_notebook(db: Session, athlete_id: int, content: str) -> AthleteNotebook:
    """Upsert one athlete's notebook, tolerating a concurrent insert (the table
    has a unique constraint on athlete_id — a race would otherwise 500)."""
    content = content[:NOTEBOOK_MAX_CHARS]
    nb = db.query(AthleteNotebook).filter(AthleteNotebook.athlete_id == athlete_id).first()
    if nb is not None:
        nb.content = content
        db.commit()
        db.refresh(nb)
        return nb
    nb = AthleteNotebook(athlete_id=athlete_id, content=content)
    db.add(nb)
    try:
        db.commit()
    except IntegrityError:
        # A parallel request inserted first — fall back to updating that row.
        db.rollback()
        nb = db.query(AthleteNotebook).filter(AthleteNotebook.athlete_id == athlete_id).first()
        nb.content = content
        db.commit()
    db.refresh(nb)
    return nb


@router.get("/notebook", response_model=NotebookOut)
def get_notebook(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    _require_athlete(current_user)
    if not current_user.ai_access:
        raise HTTPException(status_code=403, detail="The notebook is a premium feature.")
    nb = db.query(AthleteNotebook).filter(AthleteNotebook.athlete_id == current_user.id).first()
    if nb is None:
        return NotebookOut(content="", updated_at=None)
    return NotebookOut(content=nb.content or "", updated_at=nb.updated_at)


@router.put("/notebook", response_model=NotebookOut)
def update_notebook(
    body: NotebookUpdate,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    _require_athlete(current_user)
    if not current_user.ai_access:
        raise HTTPException(status_code=403, detail="The notebook is a premium feature.")
    nb = _upsert_notebook(db, current_user.id, (body.content or "").strip())
    return NotebookOut(content=nb.content or "", updated_at=nb.updated_at)


class NotebookRewriteRequest(BaseModel):
    conversation_id: int


@router.post("/notebook/rewrite", response_model=NotebookOut)
def rewrite_notebook(
    body: NotebookRewriteRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """The "Update with AI" button. Sends the current notebook + the conversation
    transcript to the cheap model, which returns a rewritten notebook (merging new
    insights, dating time-sensitive entries, dropping stale ones). The athlete can
    still edit the result afterwards via PUT."""
    _require_athlete(current_user)
    if not current_user.ai_access:
        raise HTTPException(status_code=403, detail="The notebook is a premium feature.")
    if not settings.OPENAI_API_KEY:
        raise HTTPException(status_code=503, detail="The AI assistant isn't set up yet.")

    conv = db.get(AssistantConversation, body.conversation_id)
    if conv is None or conv.athlete_id != current_user.id:
        raise HTTPException(status_code=404, detail="Conversation not found.")

    msgs = (
        db.query(AssistantMessage)
        .filter(AssistantMessage.conversation_id == conv.id, AssistantMessage.role.in_(("user", "assistant")))
        .order_by(AssistantMessage.id.asc())
        .all()
    )
    transcript = "\n".join(f"{m.role}: {m.content}" for m in msgs)
    if conv.summary:
        transcript = f"(earlier summary) {conv.summary}\n{transcript}"

    nb = db.query(AthleteNotebook).filter(AthleteNotebook.athlete_id == current_user.id).first()
    current = (nb.content or "") if nb else ""
    prompt = (
        f"{get_prompt(db, 'notebook_rewrite_prompt')}\n\n"
        f"=== Current Notebook ===\n{current or '(empty)'}\n\n"
        f"=== Latest Conversation ===\n{transcript}"
    )

    from openai import OpenAI, OpenAIError
    try:
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model=CHEAPEST_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=500,
            timeout=45,
        )
    except OpenAIError:
        raise HTTPException(status_code=502, detail="Couldn't update the notebook. Try again shortly.")

    new_content = (resp.choices[0].message.content or "").strip()
    nb = _upsert_notebook(db, current_user.id, new_content)
    return NotebookOut(content=nb.content or "", updated_at=nb.updated_at)


class StatusOut(BaseModel):
    premium: bool
    limit: int                      # free-tier cap per window
    remaining: Optional[int] = None  # free messages left; None = unlimited (premium)
    window_hours: int


@router.get("/status", response_model=StatusOut)
def status(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    """Tier + remaining free messages, for the frontend banner. Reads the free
    window without consuming anything."""
    _require_athlete(current_user)
    if current_user.ai_access:
        return StatusOut(premium=True, limit=FREE_LIMIT, remaining=None, window_hours=int(FREE_WINDOW.total_seconds() // 3600))
    used, _ = _free_window(current_user, datetime.utcnow())
    return StatusOut(
        premium=False, limit=FREE_LIMIT,
        remaining=max(0, FREE_LIMIT - used),
        window_hours=int(FREE_WINDOW.total_seconds() // 3600),
    )


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    _require_athlete(current_user)
    return (
        db.query(AssistantConversation)
        .filter(AssistantConversation.athlete_id == current_user.id)
        .order_by(AssistantConversation.updated_at.desc())
        .all()
    )


@router.get("/conversations/{conversation_id}/messages", response_model=list[MessageOut])
def conversation_messages(
    conversation_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
):
    _require_athlete(current_user)
    conv = db.get(AssistantConversation, conversation_id)
    if conv is None or conv.athlete_id != current_user.id:
        raise HTTPException(status_code=404, detail="Conversation not found.")
    msgs = (
        db.query(AssistantMessage)
        .filter(AssistantMessage.conversation_id == conv.id, AssistantMessage.role.in_(("user", "assistant")))
        .order_by(AssistantMessage.id.asc())
        .all()
    )
    return msgs
