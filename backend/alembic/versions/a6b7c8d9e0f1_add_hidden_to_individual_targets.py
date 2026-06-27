"""add hidden to individual_targets

Revision ID: a6b7c8d9e0f1
Revises: f5a6b7c8d9e0
Create Date: 2026-06-22

Coach-only draft flag: a hidden personal workout is invisible to the athlete
(calendar, counts, auto-miss) until the coach shares it.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'a6b7c8d9e0f1'
down_revision: Union[str, None] = 'f5a6b7c8d9e0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("individual_targets")}
    if "hidden" not in cols:
        with op.batch_alter_table("individual_targets") as batch_op:
            batch_op.add_column(sa.Column("hidden", sa.Boolean(), nullable=False, server_default=sa.false()))


def downgrade() -> None:
    bind = op.get_bind()
    cols = {c["name"] for c in sa.inspect(bind).get_columns("individual_targets")}
    if "hidden" in cols:
        with op.batch_alter_table("individual_targets") as batch_op:
            batch_op.drop_column("hidden")
