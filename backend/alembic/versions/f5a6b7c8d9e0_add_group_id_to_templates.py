"""add group_id to workout_templates

Revision ID: f5a6b7c8d9e0
Revises: e4f5a6b7c8d9
Create Date: 2026-06-22

Optional group scope for plans. NULL = general (private to creator); set = the
plan is shared with all coaches of that group.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'f5a6b7c8d9e0'
down_revision: Union[str, None] = 'e4f5a6b7c8d9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("workout_templates")}
    if "group_id" not in cols:
        # Raw ALTER with column-level REFERENCES works on both SQLite and
        # Postgres for a nullable FK column (avoids batch-mode anon-constraint
        # issues). Index added separately, idempotently.
        op.execute(
            "ALTER TABLE workout_templates ADD COLUMN group_id INTEGER "
            "REFERENCES training_groups(id) ON DELETE SET NULL"
        )
        op.execute(
            "CREATE INDEX IF NOT EXISTS ix_workout_templates_group_id "
            "ON workout_templates (group_id)"
        )


def downgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("workout_templates")}
    if "group_id" in cols:
        op.execute("DROP INDEX IF EXISTS ix_workout_templates_group_id")
        with op.batch_alter_table("workout_templates") as batch_op:
            batch_op.drop_column("group_id")
