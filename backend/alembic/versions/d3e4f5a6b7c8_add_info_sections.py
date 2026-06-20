"""add_info_sections

Revision ID: d3e4f5a6b7c8
Revises: c2d3e4f5a6b7
Create Date: 2026-06-20

Adds info_sections — admin-editable cards for the Info page (app rulebook), so
content can be maintained without code changes. Schema only; the default cards
are seeded at app startup if the table is empty (see app/main.py), which avoids
SQLite's non-transactional-DDL dropping the migration's DML. Idempotent: checks
table existence first.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect

revision: str = 'd3e4f5a6b7c8'
down_revision: Union[str, None] = 'c2d3e4f5a6b7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if 'info_sections' not in existing:
        op.create_table(
            'info_sections',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('position', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('title', sa.String(length=200), nullable=False),
            sa.Column('summary', sa.String(length=300), nullable=True),
            sa.Column('body', sa.Text(), nullable=False, server_default=''),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now()),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_info_sections_id', 'info_sections', ['id'])
        op.create_index('ix_info_sections_position', 'info_sections', ['position'])


def downgrade() -> None:
    op.drop_table('info_sections')
