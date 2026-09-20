"""Conversation compaction for the AI coach. When a conversation's running token
estimate crosses the threshold, fold everything older than the recent window into
a short recap stored on the conversation. The chat endpoint then sends that recap
plus the recent tail to the model, keeping context (and cost) bounded no matter
how long the conversation runs.

Runs as a FastAPI BackgroundTask, so it opens its OWN SessionLocal — the request
db is already closed by the time it fires. Always uses the cheapest model; this
is housekeeping, not coaching. DB messages are never deleted (the UI keeps the
full history); only the model-facing context is compacted."""
from __future__ import annotations
import structlog
from sqlalchemy.orm import Session

from ..config import settings
from ..database import SessionLocal
from ..models.assistant import AssistantConversation, AssistantMessage
from .assistant_prompts import get_prompt

log = structlog.get_logger()

SUMMARIZE_THRESHOLD_TOKENS = 30_000
KEEP_LAST_MSGS = 20          # recent turns left out of the summary (sent raw)
SUMMARIZER_MODEL = "gpt-4o-mini"


def _est_tokens(text: str) -> int:
    return max(1, len(text) // 4)


def maybe_summarize(conversation_id: int) -> None:
    """Entry point for the background task. Opens its own session."""
    db: Session = SessionLocal()
    try:
        _summarize(db, conversation_id)
    except Exception as exc:  # never let a background failure surface anywhere
        log.warning("assistant_summarize_failed", conversation_id=conversation_id, error=str(exc))
        db.rollback()
    finally:
        db.close()


def _summarize(db: Session, conversation_id: int) -> None:
    if not settings.OPENAI_API_KEY:
        return
    conv = db.get(AssistantConversation, conversation_id)
    if conv is None or (conv.token_count or 0) < SUMMARIZE_THRESHOLD_TOKENS:
        return

    msgs = (
        db.query(AssistantMessage)
        .filter(AssistantMessage.conversation_id == conv.id, AssistantMessage.role.in_(("user", "assistant")))
        .order_by(AssistantMessage.id.asc())
        .all()
    )
    if len(msgs) <= KEEP_LAST_MSGS:
        return

    older = msgs[:-KEEP_LAST_MSGS]
    kept = msgs[-KEEP_LAST_MSGS:]
    transcript = "\n".join(f"{m.role}: {m.content}" for m in older)
    prior = f"Summary so far: {conv.summary}\n\n" if conv.summary else ""
    prompt = f"{get_prompt(db, 'summarizer_prompt')}\n\n{prior}Conversation to summarize:\n{transcript}"

    from openai import OpenAI, OpenAIError
    try:
        client = OpenAI(api_key=settings.OPENAI_API_KEY)
        resp = client.chat.completions.create(
            model=SUMMARIZER_MODEL,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=300,
            timeout=45,
        )
    except OpenAIError as exc:
        log.warning("assistant_summarize_openai_error", conversation_id=conversation_id, error=str(exc))
        return

    summary = (resp.choices[0].message.content or "").strip()
    if not summary:
        return

    conv.summary = summary
    # Reset the running estimate to reflect the compacted context: summary + tail.
    conv.token_count = _est_tokens(summary) + sum(_est_tokens(m.content) for m in kept)
    db.commit()
