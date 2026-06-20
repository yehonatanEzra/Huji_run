"""add_content_to_individual_targets

Revision ID: a3b4c5d6e7f8
Revises: f2a3b4c5d6e7
Create Date: 2026-06-20

Splits the personal-workout free text: add `content` (the workout body for
simple/easy/rest) and repurpose `note` as a supplementary note. Existing rows
held the body in `note`, so move it to `content` and clear `note`.
Idempotent + cross-dialect.
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import inspect

revision: str = 'a3b4c5d6e7f8'
down_revision: Union[str, None] = 'f2a3b4c5d6e7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    cols = {c['name'] for c in inspect(bind).get_columns('individual_targets')}
    if 'content' not in cols:
        op.execute('ALTER TABLE individual_targets ADD COLUMN content TEXT')
        # Old data kept the body in `note`; move it to `content`, clear `note`.
        op.execute("UPDATE individual_targets SET content = note, note = ''")


def downgrade() -> None:
    pass
