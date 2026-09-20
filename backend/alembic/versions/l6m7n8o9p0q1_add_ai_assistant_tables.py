"""add_ai_assistant_tables

Revision ID: l6m7n8o9p0q1
Revises: k5l6m7n8o9p0
Create Date: 2026-09-20

Adds the AI coach redesign tables:
  - assistant_conversations  (chat sessions, token_count, summary)
  - assistant_messages       (turns: user | assistant | tool)
  - athlete_notebooks        (persistent per-athlete AI memory)
  - system_prompts           (admin-editable prompt store)

Seeds the default prompts into system_prompts. Idempotent + cross-dialect:
checks table existence via inspect, seeds via INSERT ... WHERE NOT EXISTS.
"""
from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy import inspect, text

revision: str = 'l6m7n8o9p0q1'
down_revision: Union[str, None] = 'k5l6m7n8o9p0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()
    existing = inspect(bind).get_table_names()

    if 'assistant_conversations' not in existing:
        op.create_table(
            'assistant_conversations',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('athlete_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('token_count', sa.Integer(), nullable=False, server_default='0'),
            sa.Column('summary', sa.Text(), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_assistant_conversations_id', 'assistant_conversations', ['id'])
        op.create_index('ix_assistant_conversations_athlete_id', 'assistant_conversations', ['athlete_id'])

    if 'assistant_messages' not in existing:
        op.create_table(
            'assistant_messages',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('conversation_id', sa.Integer(), sa.ForeignKey('assistant_conversations.id', ondelete='CASCADE'), nullable=False),
            sa.Column('role', sa.String(20), nullable=False),
            sa.Column('content', sa.Text(), nullable=False),
            sa.Column('tool_name', sa.String(50), nullable=True),
            sa.Column('created_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index('ix_assistant_messages_id', 'assistant_messages', ['id'])
        op.create_index('ix_assistant_messages_conversation_id', 'assistant_messages', ['conversation_id'])

    if 'athlete_notebooks' not in existing:
        op.create_table(
            'athlete_notebooks',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('athlete_id', sa.Integer(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
            sa.Column('content', sa.Text(), nullable=False, server_default=''),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('athlete_id', name='uq_athlete_notebook_athlete'),
        )
        op.create_index('ix_athlete_notebooks_id', 'athlete_notebooks', ['id'])
        op.create_index('ix_athlete_notebooks_athlete_id', 'athlete_notebooks', ['athlete_id'])

    if 'system_prompts' not in existing:
        op.create_table(
            'system_prompts',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('key', sa.String(80), nullable=False),
            sa.Column('content', sa.Text(), nullable=False),
            sa.Column('updated_at', sa.DateTime(), server_default=sa.func.now(), nullable=False),
            sa.Column('updated_by', sa.Integer(), sa.ForeignKey('users.id'), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('key', name='uq_system_prompt_key'),
        )
        op.create_index('ix_system_prompts_id', 'system_prompts', ['id'])
        op.create_index('ix_system_prompts_key', 'system_prompts', ['key'])

    # Seed default prompts (idempotent — only inserts keys not already present).
    from app.services.assistant_prompts import DEFAULT_PROMPTS
    for key, content in DEFAULT_PROMPTS.items():
        bind.execute(
            text(
                "INSERT INTO system_prompts (key, content) "
                "SELECT :key, :content WHERE NOT EXISTS ("
                "  SELECT 1 FROM system_prompts WHERE key = :key"
                ")"
            ),
            {"key": key, "content": content},
        )


def downgrade() -> None:
    op.drop_table('assistant_messages')
    op.drop_table('assistant_conversations')
    op.drop_table('athlete_notebooks')
    op.drop_table('system_prompts')
