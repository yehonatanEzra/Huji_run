"""add_strava_last_synced_at

Revision ID: g1h2i3j4k5l6
Revises: e2f3a4b5c6d7
Create Date: 2026-07-04

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = 'g1h2i3j4k5l6'
down_revision: Union[str, None] = 'e2f3a4b5c6d7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Cross-dialect: sa.DateTime renders as DATETIME on SQLite and TIMESTAMP on
    # Postgres. A raw "ADD COLUMN ... DATETIME" string breaks on Postgres (no
    # such type), which fails `alembic upgrade head` and blocks the deploy.
    bind = op.get_bind()
    cols = [c["name"] for c in inspect(bind).get_columns("users")]
    if "strava_last_synced_at" not in cols:
        op.add_column("users", sa.Column("strava_last_synced_at", sa.DateTime(), nullable=True))


def downgrade() -> None:
    pass
