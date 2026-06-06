"""add_group_coach

Revision ID: a1b2c3d4e5f6
Revises: 14a3fb5946fa
Create Date: 2026-06-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, None] = '14a3fb5946fa'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if 'group_coaches' not in existing:
        op.create_table(
            'group_coaches',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('group_id', sa.Integer(), sa.ForeignKey('training_groups.id'), nullable=False),
            sa.Column('role', sa.String(20), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('user_id', 'group_id', name='uq_group_coach'),
        )
        op.create_index('ix_group_coaches_id', 'group_coaches', ['id'])
        op.create_index('ix_group_coaches_user_id', 'group_coaches', ['user_id'])
        op.create_index('ix_group_coaches_group_id', 'group_coaches', ['group_id'])


def downgrade() -> None:
    op.drop_table('group_coaches')
