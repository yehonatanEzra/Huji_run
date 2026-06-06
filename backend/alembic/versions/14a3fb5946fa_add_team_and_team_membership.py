"""add_team_and_team_membership

Revision ID: 14a3fb5946fa
Revises: 48e113956200
Create Date: 2026-06-06

"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = '14a3fb5946fa'
down_revision: Union[str, None] = '48e113956200'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if 'teams' not in existing:
        op.create_table(
            'teams',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('name', sa.String(150), nullable=False),
            sa.Column('description', sa.Text(), nullable=True),
            sa.Column('location', sa.String(200), nullable=True),
            sa.Column('sport', sa.String(100), nullable=True),
            sa.Column('is_public', sa.Boolean(), nullable=False, server_default=sa.false()),
            sa.Column('created_by_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_teams_id', 'teams', ['id'])

    if 'team_memberships' not in existing:
        op.create_table(
            'team_memberships',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('user_id', sa.Integer(), sa.ForeignKey('users.id'), nullable=False),
            sa.Column('team_id', sa.Integer(), sa.ForeignKey('teams.id'), nullable=False),
            sa.Column('role', sa.String(20), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('user_id', 'team_id', name='uq_team_membership'),
        )
        op.create_index('ix_team_memberships_id', 'team_memberships', ['id'])
        op.create_index('ix_team_memberships_user_id', 'team_memberships', ['user_id'])
        op.create_index('ix_team_memberships_team_id', 'team_memberships', ['team_id'])


def downgrade() -> None:
    op.drop_table('team_memberships')
    op.drop_table('teams')
