"""add_distance_km_to_workouts

Revision ID: e1f2a3b4c5d6
Revises: d0e1f2a3b4c5
Create Date: 2026-06-15

Adds planned distance_km to group_workouts + individual_targets (planned distance,
distinct from workout_logs.distance_km which is actual). Idempotent + cross-dialect.
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect

revision: str = 'e1f2a3b4c5d6'
down_revision: Union[str, None] = 'd0e1f2a3b4c5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    insp = inspect(bind)
    for table in ('group_workouts', 'individual_targets'):
        cols = {c['name'] for c in insp.get_columns(table)}
        if 'distance_km' not in cols:
            op.execute(f'ALTER TABLE {table} ADD COLUMN distance_km FLOAT')


def downgrade() -> None:
    pass
