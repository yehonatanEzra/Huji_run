"""add_ai_model_usage

Revision ID: k5l6m7n8o9p0
Revises: j4k5l6m7n8o9
Create Date: 2026-08-23

Adds AI freemium columns to users: ai_model (premium's admin-chosen model),
ai_msg_count + ai_window_start (free-tier usage window). Idempotent per-column.
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect

revision: str = 'k5l6m7n8o9p0'
down_revision: Union[str, None] = 'j4k5l6m7n8o9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = [c["name"] for c in inspect(bind).get_columns("users")]
    if "ai_model" not in cols:
        op.execute("ALTER TABLE users ADD COLUMN ai_model VARCHAR(50)")
    if "ai_msg_count" not in cols:
        op.execute("ALTER TABLE users ADD COLUMN ai_msg_count INTEGER NOT NULL DEFAULT 0")
    if "ai_window_start" not in cols:
        op.execute("ALTER TABLE users ADD COLUMN ai_window_start TIMESTAMP")


def downgrade() -> None:
    bind = op.get_bind()
    cols = [c["name"] for c in inspect(bind).get_columns("users")]
    for name in ("ai_window_start", "ai_msg_count", "ai_model"):
        if name in cols:
            op.drop_column("users", name)
