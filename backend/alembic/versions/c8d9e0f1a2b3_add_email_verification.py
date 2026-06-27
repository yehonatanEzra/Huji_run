"""add email verification

Revision ID: c8d9e0f1a2b3
Revises: b7c8d9e0f1a2
Create Date: 2026-06-27

Add email + email_verified to users table (nullable for existing users).
Create email_verifications table for code-based flows (register / reset).
"""
from typing import Sequence, Union
from datetime import datetime

from alembic import op
import sqlalchemy as sa
from sqlalchemy.sql.expression import false

revision: str = 'c8d9e0f1a2b3'
down_revision: Union[str, None] = 'b7c8d9e0f1a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _cols(insp, table):
    return {c["name"] for c in insp.get_columns(table)}


def upgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)
    dialect = bind.dialect.name

    # Add columns via raw ALTER TABLE — avoids batch_alter_table reconstructing
    # the users table (which SQLite can't do because other tables FK to it).
    u_cols = _cols(insp, "users")
    if "email" not in u_cols:
        bind.execute(sa.text("ALTER TABLE users ADD COLUMN email TEXT"))
    if "email_verified" not in u_cols:
        if dialect == "sqlite":
            bind.execute(sa.text("ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT 0"))
        else:
            bind.execute(sa.text("ALTER TABLE users ADD COLUMN email_verified BOOLEAN NOT NULL DEFAULT FALSE"))

    # Unique index on users.email
    existing_indexes = {ix["name"] for ix in insp.get_indexes("users") if ix.get("name")}
    if "ix_users_email" not in existing_indexes:
        bind.execute(sa.text("CREATE UNIQUE INDEX IF NOT EXISTS ix_users_email ON users (email)"))

    # Create email_verifications table
    if "email_verifications" not in insp.get_table_names():
        op.create_table(
            "email_verifications",
            sa.Column("id", sa.Integer(), primary_key=True),
            sa.Column("email", sa.String(255), nullable=False),
            sa.Column("code_hash", sa.String(64), nullable=False),
            sa.Column("purpose", sa.String(20), nullable=False),
            sa.Column("expires_at", sa.DateTime(), nullable=False),
            sa.Column("attempts", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("consumed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index("ix_ev_email", "email_verifications", ["email"])


def downgrade() -> None:
    bind = op.get_bind()
    insp = sa.inspect(bind)

    if "email_verifications" in insp.get_table_names():
        op.drop_table("email_verifications")
