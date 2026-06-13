"""backfill_coach_team_memberships

Revision ID: b8c9d0e1f2a3
Revises: a7b8c9d0e1f2
Create Date: 2026-06-13

Coach registration historically created a User with no Team membership, so those
coaches were invisible to team-scoped flows (e.g. the assistant-coach search).
Backfill: every coach/admin with no membership joins the default (earliest) team.
Idempotent + cross-dialect via INSERT ... SELECT WHERE NOT EXISTS.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = 'b8c9d0e1f2a3'
down_revision: Union[str, None] = 'a7b8c9d0e1f2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.get_bind().execute(sa.text("""
        INSERT INTO team_memberships (user_id, team_id, role)
        SELECT u.id, (SELECT id FROM teams ORDER BY id LIMIT 1), 'main'
        FROM users u
        WHERE u.role IN ('coach', 'admin')
          AND EXISTS (SELECT 1 FROM teams)
          AND NOT EXISTS (
            SELECT 1 FROM team_memberships tm WHERE tm.user_id = u.id
          )
    """))


def downgrade() -> None:
    # Data backfill — nothing to safely reverse.
    pass
