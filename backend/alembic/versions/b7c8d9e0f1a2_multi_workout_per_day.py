"""multi workout per day

Revision ID: b7c8d9e0f1a2
Revises: a6b7c8d9e0f1
Create Date: 2026-06-22

Allow multiple workouts per day:
  - drop unique (athlete_id, date) on individual_targets
  - drop unique (template_id, week_number, day_of_week) on workout_template_days
  - add `position` ordering column to both
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b7c8d9e0f1a2'
down_revision: Union[str, None] = 'a6b7c8d9e0f1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _cols(insp, table):
    return {c["name"] for c in insp.get_columns(table)}


def _uniques(insp, table):
    return {u["name"] for u in insp.get_unique_constraints(table) if u.get("name")}


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    it_cols, it_uqs = _cols(insp, "individual_targets"), _uniques(insp, "individual_targets")
    with op.batch_alter_table("individual_targets") as b:
        if "uq_target_athlete_date" in it_uqs:
            b.drop_constraint("uq_target_athlete_date", type_="unique")
        if "position" not in it_cols:
            b.add_column(sa.Column("position", sa.Integer(), nullable=False, server_default="0"))

    td_cols, td_uqs = _cols(insp, "workout_template_days"), _uniques(insp, "workout_template_days")
    with op.batch_alter_table("workout_template_days") as b:
        if "uq_template_week_day" in td_uqs:
            b.drop_constraint("uq_template_week_day", type_="unique")
        if "position" not in td_cols:
            b.add_column(sa.Column("position", sa.Integer(), nullable=False, server_default="0"))


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    with op.batch_alter_table("workout_template_days") as b:
        if "position" in _cols(insp, "workout_template_days"):
            b.drop_column("position")
        b.create_unique_constraint("uq_template_week_day", ["template_id", "week_number", "day_of_week"])

    with op.batch_alter_table("individual_targets") as b:
        if "position" in _cols(insp, "individual_targets"):
            b.drop_column("position")
        b.create_unique_constraint("uq_target_athlete_date", ["athlete_id", "date"])
