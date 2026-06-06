"""add_workout_templates

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-06-06

Adds workout_templates + workout_template_days for FR-A (reusable
multi-week training plans). Idempotent: checks table existence first.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if 'workout_templates' not in existing:
        op.create_table(
            'workout_templates',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id', ondelete='SET NULL'), nullable=True),
            sa.Column('name', sa.String(150), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('weeks_count', sa.Integer(), nullable=False, server_default='1'),
            sa.Column('created_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_workout_templates_id', 'workout_templates', ['id'])
        op.create_index('ix_workout_templates_team_id', 'workout_templates', ['team_id'])
        op.create_index('ix_workout_templates_created_by', 'workout_templates', ['created_by'])

    if 'workout_template_days' not in existing:
        op.create_table(
            'workout_template_days',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('template_id', sa.Integer(), sa.ForeignKey('workout_templates.id', ondelete='CASCADE'), nullable=False),
            sa.Column('week_number', sa.Integer(), nullable=False),
            sa.Column('day_of_week', sa.Integer(), nullable=False),
            sa.Column('workout_type', sa.String(20), nullable=False, server_default='simple'),
            sa.Column('title', sa.String(200), nullable=True),
            sa.Column('content', sa.Text(), nullable=True),
            sa.Column('warmup', sa.Text(), nullable=True),
            sa.Column('main_session', sa.Text(), nullable=True),
            sa.Column('cooldown', sa.Text(), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('template_id', 'week_number', 'day_of_week', name='uq_template_week_day'),
        )
        op.create_index('ix_workout_template_days_id', 'workout_template_days', ['id'])
        op.create_index('ix_workout_template_days_template_id', 'workout_template_days', ['template_id'])


def downgrade() -> None:
    op.drop_table('workout_template_days')
    op.drop_table('workout_templates')
