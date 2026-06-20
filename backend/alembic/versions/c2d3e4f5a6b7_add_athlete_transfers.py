"""add_athlete_transfers

Revision ID: c2d3e4f5a6b7
Revises: b1c2d3e4f5a6
Create Date: 2026-06-20

Adds athlete_transfers — a coach's request to hand an athlete to a co-coach of the
same group, completing only once both the destination coach AND the athlete approve.
Idempotent: checks table existence first. FKs declared inline with ON DELETE CASCADE.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = 'c2d3e4f5a6b7'
down_revision: Union[str, None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if 'athlete_transfers' not in existing:
        op.create_table(
            'athlete_transfers',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('athlete_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('group_id', sa.Integer(), sa.ForeignKey('training_groups.id', ondelete='CASCADE'), nullable=False),
            sa.Column('from_coach_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('to_coach_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('to_coach_approved', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('athlete_approved', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column('decided_at', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_athlete_transfers_id', 'athlete_transfers', ['id'])
        op.create_index('ix_athlete_transfers_athlete_id', 'athlete_transfers', ['athlete_id'])
        op.create_index('ix_athlete_transfers_group_id', 'athlete_transfers', ['group_id'])
        op.create_index('ix_athlete_transfers_from_coach_id', 'athlete_transfers', ['from_coach_id'])
        op.create_index('ix_athlete_transfers_to_coach_id', 'athlete_transfers', ['to_coach_id'])


def downgrade() -> None:
    op.drop_table('athlete_transfers')
