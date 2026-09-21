"""add_info_section_parent

Revision ID: m7n8o9p0q1r2
Revises: l6m7n8o9p0q1
Create Date: 2026-09-21

Adds a self-referential parent_id to info_sections so cards can own subcards
(one level deep). Idempotent; raw ALTER + CREATE INDEX to stay cross-dialect and
avoid anonymous FK constraints in SQLite batch mode.
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect

revision: str = 'm7n8o9p0q1r2'
down_revision: Union[str, None] = 'l6m7n8o9p0q1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if "info_sections" not in insp.get_table_names():
        return  # fresh DB: create_all builds the table with the column already
    cols = [c["name"] for c in insp.get_columns("info_sections")]
    if "parent_id" not in cols:
        op.execute(
            "ALTER TABLE info_sections ADD COLUMN parent_id INTEGER "
            "REFERENCES info_sections(id) ON DELETE CASCADE"
        )
    op.execute("CREATE INDEX IF NOT EXISTS ix_info_sections_parent_id ON info_sections (parent_id)")


def downgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    if "info_sections" not in insp.get_table_names():
        return
    op.execute("DROP INDEX IF EXISTS ix_info_sections_parent_id")
    cols = [c["name"] for c in insp.get_columns("info_sections")]
    if "parent_id" in cols:
        op.drop_column("info_sections", "parent_id")
