"""add_race_id_to_goals

Revision ID: d0e1f2a3b4c5
Revises: c9d0e1f2a3b4
Create Date: 2026-06-14

Adds goals.race_id (FK races) for race goals (FR-H). Idempotent + cross-dialect:
raw ALTER TABLE ... REFERENCES (avoids SQLite batch anonymous-FK issues).
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect

revision: str = 'd0e1f2a3b4c5'
down_revision: Union[str, None] = 'c9d0e1f2a3b4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c['name'] for c in inspect(bind).get_columns('goals')}
    if 'race_id' not in cols:
        op.execute('ALTER TABLE goals ADD COLUMN race_id INTEGER REFERENCES races(id)')
        op.execute('CREATE INDEX IF NOT EXISTS ix_goals_race_id ON goals (race_id)')


def downgrade() -> None:
    pass
