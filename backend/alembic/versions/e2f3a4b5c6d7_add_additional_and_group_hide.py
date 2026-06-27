"""add personal 'additional' flag + per-day group-workout hide

Revision ID: d0e1f2a3b4c5
Revises: c8d9e0f1a2b3
Create Date: 2026-06-27

Replaces the per-target "show instead of group" (override_group) model with:
  - individual_targets.additional  — show this personal workout in addition to
    the group workout (athlete sees both); when false, an existing group workout
    suppresses it.
  - group_workout_hides(athlete_id, date) — day-level "don't show group workout
    today" for one athlete.

Data migration keeps current behavior: every target with override_group=true is
re-expressed as additional=true + a group_workout_hides row for that athlete/day.
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e2f3a4b5c6d7'
down_revision: Union[str, None] = 'c8d9e0f1a2b3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _cols(insp, table):
    return {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    dialect = bind.dialect.name
    true_lit = "TRUE" if dialect == "postgresql" else "1"

    # 1) individual_targets.additional
    if "additional" not in _cols(insp, "individual_targets"):
        default = "FALSE" if dialect == "postgresql" else "0"
        bind.execute(sa.text(
            f"ALTER TABLE individual_targets ADD COLUMN additional BOOLEAN NOT NULL DEFAULT {default}"
        ))

    # 2) group_workout_hides table
    if "group_workout_hides" not in insp.get_table_names():
        op.create_table(
            "group_workout_hides",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("team_id", sa.Integer(), sa.ForeignKey("teams.id", ondelete="SET NULL"), nullable=True),
            sa.Column("athlete_id", sa.Integer(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
            sa.Column("date", sa.Date(), nullable=False),
            sa.Column("created_by", sa.Integer(), sa.ForeignKey("users.id"), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.UniqueConstraint("athlete_id", "date", name="uq_group_hide_athlete_date"),
        )
        op.create_index("ix_gwh_athlete", "group_workout_hides", ["athlete_id"])
        op.create_index("ix_gwh_date", "group_workout_hides", ["date"])

    # 3) Data migration: override_group=true → additional=true + a hide row.
    bind.execute(sa.text(
        f"UPDATE individual_targets SET additional = {true_lit} WHERE override_group = {true_lit}"
    ))
    bind.execute(sa.text(
        f"""
        INSERT INTO group_workout_hides (athlete_id, date, created_by)
        SELECT t.athlete_id, t.date, MIN(t.created_by)
        FROM individual_targets t
        WHERE t.override_group = {true_lit}
          AND NOT EXISTS (
            SELECT 1 FROM group_workout_hides h
            WHERE h.athlete_id = t.athlete_id AND h.date = t.date
          )
        GROUP BY t.athlete_id, t.date
        """
    ))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    if "group_workout_hides" in insp.get_table_names():
        op.drop_table("group_workout_hides")
    # leave individual_targets.additional in place (harmless)
