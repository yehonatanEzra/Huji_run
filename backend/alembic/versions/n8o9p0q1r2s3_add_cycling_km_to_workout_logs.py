"""add cycling_km to workout_logs

Revision ID: n8o9p0q1r2s3
Revises: m7n8o9p0q1r2
Create Date: 2026-09-21

"""
from alembic import op
from sqlalchemy import inspect

revision = 'n8o9p0q1r2s3'
down_revision = 'm7n8o9p0q1r2'
branch_labels = None
depends_on = None


def upgrade():
    bind = op.get_bind()
    cols = [c["name"] for c in inspect(bind).get_columns("workout_logs")]
    if "cycling_km" not in cols:
        op.execute("ALTER TABLE workout_logs ADD COLUMN cycling_km FLOAT")


def downgrade():
    bind = op.get_bind()
    cols = [c["name"] for c in inspect(bind).get_columns("workout_logs")]
    if "cycling_km" in cols:
        with op.batch_alter_table("workout_logs") as batch_op:
            batch_op.drop_column("cycling_km")
