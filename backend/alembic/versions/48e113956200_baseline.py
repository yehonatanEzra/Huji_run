"""baseline

Revision ID: 48e113956200
Revises:
Create Date: 2026-06-06

This is a no-op marker migration that records the state of the schema at the
point Alembic was adopted. The existing database was already created by
SQLAlchemy create_all + the legacy _migrate_* functions in main.py.

All future schema changes go through Alembic migrations only.
"""
from typing import Sequence, Union

revision: str = '48e113956200'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
