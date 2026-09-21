"""refresh get_load/get_log tool descriptions for cross-training

Updates the two tool prompt rows to mention cycling/swim/strength, but ONLY when
the stored content still equals the original default — so an admin's custom
wording is never clobbered. Fresh DBs already get the new text from the seed.

Revision ID: q1r2s3t4u5v6
Revises: p0q1r2s3t4u5
Create Date: 2026-09-21

"""
from alembic import op
from sqlalchemy import inspect, text

revision = 'q1r2s3t4u5v6'
down_revision = 'p0q1r2s3t4u5'
branch_labels = None
depends_on = None


_OLD_LOAD = (
    "Get the athlete's weekly training volume (total km and number of runs per "
    "week) for roughly the last 6 months. Use for load, volume, and overtraining "
    "questions. Takes no arguments."
)
_OLD_LOG = (
    "Get the athlete's day-by-day training log for a date range: the planned "
    "workout, what they actually did, distance, and their notes. Only days the "
    "athlete logged something are returned. Maximum range is 120 days."
)


def _update(bind, key, old, new):
    bind.execute(
        text("UPDATE system_prompts SET content = :new WHERE key = :key AND content = :old"),
        {"new": new, "key": key, "old": old},
    )


def upgrade():
    bind = op.get_bind()
    if "system_prompts" not in inspect(bind).get_table_names():
        return
    from app.services.assistant_prompts import TOOL_GET_LOAD_DESC, TOOL_GET_LOG_DESC
    _update(bind, "tool_get_load", _OLD_LOAD, TOOL_GET_LOAD_DESC)
    _update(bind, "tool_get_log", _OLD_LOG, TOOL_GET_LOG_DESC)


def downgrade():
    bind = op.get_bind()
    if "system_prompts" not in inspect(bind).get_table_names():
        return
    from app.services.assistant_prompts import TOOL_GET_LOAD_DESC, TOOL_GET_LOG_DESC
    _update(bind, "tool_get_load", TOOL_GET_LOAD_DESC, _OLD_LOAD)
    _update(bind, "tool_get_log", TOOL_GET_LOG_DESC, _OLD_LOG)
