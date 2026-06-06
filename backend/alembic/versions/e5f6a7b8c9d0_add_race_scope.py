"""add_race_scope

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-06-06

Adds scope column to races table.
Values: 'personal' | 'group' | 'global' (default 'global').
Existing races default to 'global' (they are already admin-verified).
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import text, inspect

revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = {c["name"] for c in inspect(bind).get_columns("races")}
    if "scope" not in existing:
        bind.execute(text("ALTER TABLE races ADD COLUMN scope VARCHAR(20) NOT NULL DEFAULT 'global'"))


def downgrade() -> None:
    with op.batch_alter_table("races") as batch_op:
        batch_op.drop_column("scope")
