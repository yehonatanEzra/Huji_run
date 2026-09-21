"""add did_strength to workout_logs

Revision ID: p0q1r2s3t4u5
Revises: o9p0q1r2s3t4
Create Date: 2026-09-21

"""
from alembic import op
from sqlalchemy import inspect

revision = 'p0q1r2s3t4u5'
down_revision = 'o9p0q1r2s3t4'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    cols = [c["name"] for c in inspect(bind).get_columns("workout_logs")]
    if "did_strength" not in cols:
        # Postgres boolean rejects an integer default; SQLite has no boolean
        # literal keyword pre-3.23, so use 0. Branch on dialect for both.
        default = "false" if bind.dialect.name == "postgresql" else "0"
        op.execute(f"ALTER TABLE workout_logs ADD COLUMN did_strength BOOLEAN NOT NULL DEFAULT {default}")


def downgrade():
    bind = op.get_bind()
    cols = [c["name"] for c in inspect(bind).get_columns("workout_logs")]
    if "did_strength" in cols:
        with op.batch_alter_table("workout_logs") as batch_op:
            batch_op.drop_column("did_strength")
