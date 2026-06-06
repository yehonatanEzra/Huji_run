"""add_team_id_to_domain_tables

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-06-06

Adds nullable team_id (FK → teams, ON DELETE SET NULL) to all domain tables.
Existing rows keep team_id = NULL until the data migration (next revision)
fills them in.

Uses raw ALTER TABLE / CREATE INDEX to avoid the anonymous-FK-constraint error
that occurs when sa.ForeignKey() is passed to batch_op.add_column() under
SQLite batch mode.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect, text

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

TABLES = [
    "training_groups",
    "group_workouts",
    "individual_targets",
    "workout_logs",
    "races",
    "heats",
    "results",
    "hall_of_fame",
    "announcements",
    "race_registrations",
]


def upgrade() -> None:
    bind = op.get_bind()
    inspector = inspect(bind)

    for table in TABLES:
        existing_cols = {c["name"] for c in inspector.get_columns(table)}
        if "team_id" in existing_cols:
            continue

        bind.execute(text(f"ALTER TABLE {table} ADD COLUMN team_id INTEGER REFERENCES teams(id) ON DELETE SET NULL"))
        bind.execute(text(f"CREATE INDEX IF NOT EXISTS ix_{table}_team_id ON {table}(team_id)"))


def downgrade() -> None:
    bind = op.get_bind()
    dialect = bind.dialect.name

    if dialect == "sqlite":
        for table in reversed(TABLES):
            inspector = inspect(bind)
            existing_cols = {c["name"] for c in inspector.get_columns(table)}
            if "team_id" not in existing_cols:
                continue
            with op.batch_alter_table(table) as batch_op:
                batch_op.drop_index(f"ix_{table}_team_id")
                batch_op.drop_column("team_id")
    else:
        for table in reversed(TABLES):
            inspector = inspect(bind)
            existing_cols = {c["name"] for c in inspector.get_columns(table)}
            if "team_id" not in existing_cols:
                continue
            op.drop_index(f"ix_{table}_team_id", table_name=table)
            op.drop_column(table, "team_id")
