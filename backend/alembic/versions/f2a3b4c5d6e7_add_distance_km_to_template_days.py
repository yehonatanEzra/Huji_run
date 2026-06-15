"""add_distance_km_to_template_days

Revision ID: f2a3b4c5d6e7
Revises: e1f2a3b4c5d6
Create Date: 2026-06-15

Adds planned distance_km to workout_template_days so plans can carry distance,
which materializes onto GroupWorkout rows on apply. Idempotent + cross-dialect.
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect

revision: str = 'f2a3b4c5d6e7'
down_revision: Union[str, None] = 'e1f2a3b4c5d6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c['name'] for c in inspect(bind).get_columns('workout_template_days')}
    if 'distance_km' not in cols:
        op.execute('ALTER TABLE workout_template_days ADD COLUMN distance_km FLOAT')


def downgrade() -> None:
    pass
