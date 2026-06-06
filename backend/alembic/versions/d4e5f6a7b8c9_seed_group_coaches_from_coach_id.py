"""seed_group_coaches_from_coach_id

Revision ID: d4e5f6a7b8c9
Revises: c3d4e5f6a7b8
Create Date: 2026-06-06

Populates group_coaches from training_groups.coach_id so existing groups
have a main-coach record in the new join table. Idempotent.
"""
from typing import Sequence, Union
from alembic import op
from sqlalchemy import text

revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, None] = 'c3d4e5f6a7b8'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    groups = bind.execute(text(
        "SELECT id, coach_id FROM training_groups WHERE coach_id IS NOT NULL"
    )).fetchall()
    for group_id, coach_id in groups:
        bind.execute(text(
            "INSERT INTO group_coaches (user_id, group_id, role) "
            "SELECT :uid, :gid, 'main' WHERE NOT EXISTS ("
            "  SELECT 1 FROM group_coaches WHERE user_id = :uid AND group_id = :gid"
            ")"
        ), {"uid": coach_id, "gid": group_id})


def downgrade() -> None:
    bind = op.get_bind()
    bind.execute(text("DELETE FROM group_coaches"))
