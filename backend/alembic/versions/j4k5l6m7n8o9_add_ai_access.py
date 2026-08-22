"""add_ai_access

Revision ID: j4k5l6m7n8o9
Revises: i3j4k5l6m7n8
Create Date: 2026-08-23

Adds users.ai_access — admin-granted access to the AI training assistant
("premium"). Default off. Idempotent: checks column existence first; adds via
raw ALTER with a server default so existing rows backfill to false.
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect

revision: str = 'j4k5l6m7n8o9'
down_revision: Union[str, None] = 'i3j4k5l6m7n8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = [c["name"] for c in inspect(bind).get_columns("users")]
    if "ai_access" not in cols:
        op.execute("ALTER TABLE users ADD COLUMN ai_access BOOLEAN NOT NULL DEFAULT false")


def downgrade() -> None:
    bind = op.get_bind()
    cols = [c["name"] for c in inspect(bind).get_columns("users")]
    if "ai_access" in cols:
        op.drop_column("users", "ai_access")
