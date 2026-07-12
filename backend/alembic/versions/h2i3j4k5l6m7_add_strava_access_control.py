"""add_strava_access_control

Adds per-user users.strava_enabled (default true) and the app_settings
key-value table (holds the global strava_block_all flag).

Revision ID: h2i3j4k5l6m7
Revises: g1h2i3j4k5l6
Create Date: 2026-07-12

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = 'h2i3j4k5l6m7'
down_revision: Union[str, None] = 'g1h2i3j4k5l6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)

    cols = [c["name"] for c in insp.get_columns("users")]
    if "strava_enabled" not in cols:
        # NOT NULL with server_default true() backfills existing rows to enabled.
        op.add_column(
            "users",
            sa.Column("strava_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        )

    if "app_settings" not in insp.get_table_names():
        op.create_table(
            "app_settings",
            sa.Column("key", sa.String(length=64), primary_key=True),
            sa.Column("value", sa.String(length=255), nullable=False),
        )


def downgrade() -> None:
    pass
