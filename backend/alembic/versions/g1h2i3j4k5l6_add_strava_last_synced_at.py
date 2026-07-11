"""add_strava_last_synced_at

Revision ID: g1h2i3j4k5l6
Revises: e2f3a4b5c6d7
Create Date: 2026-07-04

"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import inspect

revision: str = 'g1h2i3j4k5l6'
down_revision: Union[str, None] = 'e2f3a4b5c6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = [c["name"] for c in inspect(bind).get_columns("users")]
    if "strava_last_synced_at" not in cols:
        op.execute("ALTER TABLE users ADD COLUMN strava_last_synced_at DATETIME")


def downgrade() -> None:
    pass
