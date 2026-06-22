"""add week_targets to workout_templates

Revision ID: e4f5a6b7c8d9
Revises: d3e4f5a6b7c8
Create Date: 2026-06-22

Adds a nullable JSON-text column holding per-week target volumes
({week_number: target_km}) for the plan builder's written/target counter.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e4f5a6b7c8d9'
down_revision: Union[str, None] = 'd3e4f5a6b7c8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("workout_templates")}
    if "week_targets" not in cols:
        op.execute("ALTER TABLE workout_templates ADD COLUMN week_targets TEXT")


def downgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("workout_templates")}
    if "week_targets" in cols:
        with op.batch_alter_table("workout_templates") as batch_op:
            batch_op.drop_column("week_targets")
