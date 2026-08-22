"""add_subgroups

Revision ID: i3j4k5l6m7n8
Revises: h2i3j4k5l6m7
Create Date: 2026-08-22

Adds subgroups + subgroup_members — named, reusable subsets of a training
group's athletes, used to target group workouts and plans. Shared among the
group's coaches; overlapping (an athlete may be in several). Idempotent: checks
table existence first. FKs declared inline with ON DELETE CASCADE (fresh tables
created whole, so SQLite batch-mode anonymous-FK limits don't apply).
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = 'i3j4k5l6m7n8'
down_revision: Union[str, None] = 'h2i3j4k5l6m7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if 'subgroups' not in existing:
        op.create_table(
            'subgroups',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('training_group_id', sa.Integer(), sa.ForeignKey('training_groups.id', ondelete='CASCADE'), nullable=False),
            sa.Column('name', sa.String(length=100), nullable=False),
            sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_subgroups_id', 'subgroups', ['id'])
        op.create_index('ix_subgroups_training_group_id', 'subgroups', ['training_group_id'])

    if 'subgroup_members' not in existing:
        op.create_table(
            'subgroup_members',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('subgroup_id', sa.Integer(), sa.ForeignKey('subgroups.id', ondelete='CASCADE'), nullable=False),
            sa.Column('athlete_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('subgroup_id', 'athlete_id', name='uq_subgroup_member'),
        )
        op.create_index('ix_subgroup_members_id', 'subgroup_members', ['id'])
        op.create_index('ix_subgroup_members_subgroup_id', 'subgroup_members', ['subgroup_id'])
        op.create_index('ix_subgroup_members_athlete_id', 'subgroup_members', ['athlete_id'])


def downgrade() -> None:
    op.drop_table('subgroup_members')
    op.drop_table('subgroups')
