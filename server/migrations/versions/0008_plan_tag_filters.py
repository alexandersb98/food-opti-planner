"""The plan's recipe filters: tags a recipe must have or must not have
(slice 10).

Revision ID: 0008
Revises: 0007
Create Date: 2026-10-27
"""

import sqlalchemy as sa
from alembic import op

revision = "0008"
down_revision = "0007"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plan_tag_filters",
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.Column("mode", sa.String(length=5), nullable=False),
        sa.ForeignKeyConstraint(["plan_id"], ["plan.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("plan_id", "tag_id"),
    )


def downgrade() -> None:
    op.drop_table("plan_tag_filters")
