"""add_group_coach_invites

Revision ID: b1c2d3e4f5a6
Revises: a3b4c5d6e7f8
Create Date: 2026-06-20

Adds group_coach_invites — a main coach's pending invitation for another coach to
co-coach a group, which the invited coach must accept before a GroupCoach row is
created (FR-E). Idempotent: checks table existence first. FKs declared inline with
ON DELETE CASCADE (fresh whole table, so SQLite batch-mode FK limits don't apply).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = 'b1c2d3e4f5a6'
down_revision: Union[str, None] = 'a3b4c5d6e7f8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if 'group_coach_invites' not in existing:
        op.create_table(
            'group_coach_invites',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('group_id', sa.Integer(), sa.ForeignKey('training_groups.id', ondelete='CASCADE'), nullable=False),
            sa.Column('invited_user_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('invited_by_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('role', sa.String(length=20), nullable=False, server_default='assistant'),
            sa.Column('status', sa.String(length=20), nullable=False, server_default='pending'),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column('decided_at', sa.DateTime(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_group_coach_invites_id', 'group_coach_invites', ['id'])
        op.create_index('ix_group_coach_invites_group_id', 'group_coach_invites', ['group_id'])
        op.create_index('ix_group_coach_invites_invited_user_id', 'group_coach_invites', ['invited_user_id'])
        op.create_index('ix_group_coach_invites_invited_by_id', 'group_coach_invites', ['invited_by_id'])


def downgrade() -> None:
    op.drop_table('group_coach_invites')
