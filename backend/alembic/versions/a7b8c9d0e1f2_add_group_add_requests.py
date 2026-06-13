"""add_group_add_requests

Revision ID: a7b8c9d0e1f2
Revises: f6a7b8c9d0e1
Create Date: 2026-06-13

Adds group_add_requests — an assistant coach's pending request to add their
athlete to a group, awaiting the group's main coach's approval. FR-E membership
permission model. Idempotent: checks table existence first. FKs are declared
inline with ON DELETE CASCADE (a fresh table created whole, so SQLite batch-mode
anonymous-FK limitations don't apply).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = 'a7b8c9d0e1f2'
down_revision: Union[str, None] = 'f6a7b8c9d0e1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if 'group_add_requests' not in existing:
        op.create_table(
            'group_add_requests',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('athlete_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('group_id', sa.Integer(), sa.ForeignKey('training_groups.id', ondelete='CASCADE'), nullable=False),
            sa.Column('requested_by_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('athlete_id', 'group_id', name='uq_group_add_request_athlete_group'),
        )
        op.create_index('ix_group_add_requests_id', 'group_add_requests', ['id'])
        op.create_index('ix_group_add_requests_athlete_id', 'group_add_requests', ['athlete_id'])
        op.create_index('ix_group_add_requests_group_id', 'group_add_requests', ['group_id'])
        op.create_index('ix_group_add_requests_requested_by_id', 'group_add_requests', ['requested_by_id'])


def downgrade() -> None:
    op.drop_table('group_add_requests')
