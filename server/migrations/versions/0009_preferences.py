"""The user's preferences, such as the preferred unit of each category
(slice U1).

Revision ID: 0009
Revises: 0008
Create Date: 2026-11-08
"""

import sqlalchemy as sa
from alembic import op

revision = "0009"
down_revision = "0008"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "preferences",
        sa.Column("key", sa.String(length=50), nullable=False),
        sa.Column("value", sa.String(length=100), nullable=False),
        sa.PrimaryKeyConstraint("key"),
    )


def downgrade() -> None:
    op.drop_table("preferences")
