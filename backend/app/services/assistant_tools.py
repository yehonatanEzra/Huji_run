"""OpenAI tool (function-calling) definitions for the AI coach and the dispatcher
that runs them. All three tools are read-only and scoped to the one athlete.
Descriptions come from the admin-editable SystemPrompt store."""
from __future__ import annotations
from datetime import date
from sqlalchemy.orm import Session

from ..models.user import User
from .assistant_context import get_load, get_log, get_race_history
from .assistant_prompts import get_prompt


def tool_schemas(db: Session) -> list[dict]:
    """OpenAI function schemas for the three read tools."""
    return [
        {
            "type": "function",
            "function": {
                "name": "get_load",
                "description": get_prompt(db, "tool_get_load"),
                "parameters": {"type": "object", "properties": {}, "required": []},
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_log",
                "description": get_prompt(db, "tool_get_log"),
                "parameters": {
                    "type": "object",
                    "properties": {
                        "start_date": {"type": "string", "description": "Inclusive start date, YYYY-MM-DD."},
                        "end_date": {"type": "string", "description": "Inclusive end date, YYYY-MM-DD."},
                    },
                    "required": ["start_date", "end_date"],
                },
            },
        },
        {
            "type": "function",
            "function": {
                "name": "get_race_history",
                "description": get_prompt(db, "tool_get_race_history"),
                "parameters": {"type": "object", "properties": {}, "required": []},
            },
        },
    ]


def execute_tool(name: str, args: dict, db: Session, athlete: User) -> str:
    if name == "get_load":
        return get_load(db, athlete)
    if name == "get_race_history":
        return get_race_history(db, athlete)
    if name == "get_log":
        try:
            start = date.fromisoformat(args["start_date"])
            end = date.fromisoformat(args["end_date"])
        except (KeyError, ValueError):
            return "Invalid dates. Provide start_date and end_date as YYYY-MM-DD."
        return get_log(db, athlete, start, end)
    return f"Unknown tool: {name}"
