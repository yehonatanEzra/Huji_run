"""add_goals

Revision ID: c9d0e1f2a3b4
Revises: b8c9d0e1f2a3
Create Date: 2026-06-14

Adds the goals table for FR-H (volume + PB goals). Idempotent: checks table
existence first; cross-dialect.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = 'c9d0e1f2a3b4'
down_revision: Union[str, None] = 'b8c9d0e1f2a3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if 'goals' not in existing:
        op.create_table(
            'goals',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id', ondelete='SET NULL'), nullable=True),
            sa.Column('athlete_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('created_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('goal_type', sa.String(20), nullable=False),
            sa.Column('distance_m', sa.Integer(), nullable=True),
            sa.Column('target_km', sa.Float(), nullable=True),
            sa.Column('target_seconds', sa.Integer(), nullable=True),
            sa.Column('note', sa.String(200), nullable=True),
            sa.Column('status', sa.String(20), nullable=False, server_default='active'),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_goals_id', 'goals', ['id'])
        op.create_index('ix_goals_team_id', 'goals', ['team_id'])
        op.create_index('ix_goals_athlete_id', 'goals', ['athlete_id'])


def downgrade() -> None:
    op.drop_table('goals')
