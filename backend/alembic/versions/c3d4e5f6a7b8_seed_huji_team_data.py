"""seed_huji_team_data

Revision ID: c3d4e5f6a7b8
Revises: b2c3d4e5f6a7
Create Date: 2026-06-06

One-time data migration that:
  1. Seeds a single "Huji Run" Team row (created by the first admin/coach).
  2. Creates TeamMembership rows for every coach/admin user.
  3. Backfills team_id on all 10 domain tables.

Idempotent: checks for the team before inserting, skips rows that already have
team_id set.
"""
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

DOMAIN_TABLES = [
    "training_groups",
    "group_workouts",
    "individual_targets",
    "workout_logs",
    "races",
    "heats",
    "results",
    "hall_of_fame",
    "announcements",
    "race_registrations",
]


def upgrade() -> None:
    bind = op.get_bind()

    # 1. Find the owner: first admin, falling back to first coach.
    row = bind.execute(text(
        "SELECT id FROM users WHERE role = 'admin' ORDER BY id ASC LIMIT 1"
    )).fetchone()
    if row is None:
        row = bind.execute(text(
            "SELECT id FROM users WHERE role = 'coach' ORDER BY id ASC LIMIT 1"
        )).fetchone()
    if row is None:
        # Completely empty DB — nothing to backfill.
        return
    owner_id = row[0]

    # 2. Seed the Huji Run team (idempotent).
    existing = bind.execute(text(
        "SELECT id FROM teams WHERE name = 'Huji Run' LIMIT 1"
    )).fetchone()

    if existing is None:
        bind.execute(text(
            "INSERT INTO teams (name, description, is_public, created_by_id) "
            "VALUES ('Huji Run', 'Hebrew University running team', false, :owner_id)"
        ), {"owner_id": owner_id})

    team_row = bind.execute(text(
        "SELECT id FROM teams WHERE name = 'Huji Run' LIMIT 1"
    )).fetchone()
    team_id = team_row[0]

    # 3. Add TeamMembership for every coach/admin (idempotent via INSERT OR IGNORE).
    coaches = bind.execute(text(
        "SELECT id FROM users WHERE role IN ('coach', 'admin')"
    )).fetchall()
    for (user_id,) in coaches:
        bind.execute(text(
            "INSERT INTO team_memberships (user_id, team_id, role) "
            "SELECT :uid, :tid, 'main' WHERE NOT EXISTS ("
            "  SELECT 1 FROM team_memberships WHERE user_id = :uid AND team_id = :tid"
            ")"
        ), {"uid": user_id, "tid": team_id})

    # 4. Backfill team_id on all domain tables (only NULL rows).
    for table in DOMAIN_TABLES:
        bind.execute(text(
            f"UPDATE {table} SET team_id = :tid WHERE team_id IS NULL"
        ), {"tid": team_id})


def downgrade() -> None:
    bind = op.get_bind()

    # Clear backfilled team_id values from domain tables.
    for table in DOMAIN_TABLES:
        bind.execute(text(f"UPDATE {table} SET team_id = NULL"))

    # Remove memberships and the team itself.
    bind.execute(text("DELETE FROM team_memberships"))
    bind.execute(text("DELETE FROM teams WHERE name = 'Huji Run'"))
