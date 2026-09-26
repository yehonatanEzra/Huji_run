"""add_todos

Revision ID: r2s3t4u5v6w7
Revises: q1r2s3t4u5v6
Create Date: 2026-09-26

Adds the todos table (private per-user checklist + notes). Idempotent: checks
table existence first; cross-dialect.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = 'r2s3t4u5v6w7'
down_revision: Union[str, None] = 'q1r2s3t4u5v6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if 'todos' not in existing:
        op.create_table(
            'todos',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id', ondelete='SET NULL'), nullable=True),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('text', sa.String(300), nullable=False),
            sa.Column('note', sa.String(2000), nullable=True),
            sa.Column('done', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_todos_id', 'todos', ['id'])
        op.create_index('ix_todos_team_id', 'todos', ['team_id'])
        op.create_index('ix_todos_user_id', 'todos', ['user_id'])


def downgrade() -> None:
    op.drop_table('todos')
