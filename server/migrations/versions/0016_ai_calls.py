"""The daily count of model calls (slice R4).

Revision ID: 0016
Revises: 0015
Create Date: 2026-11-09
"""

import sqlalchemy as sa
from alembic import op

revision = "0016"
down_revision = "0015"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "ai_calls",
        sa.Column("day", sa.Date(), nullable=False),
        sa.Column("calls", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("day", name="pk_ai_calls"),
    )


def downgrade() -> None:
    op.drop_table("ai_calls")
