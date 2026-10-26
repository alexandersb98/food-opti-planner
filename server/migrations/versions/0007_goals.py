"""The plan's goals: bounds on an attribute that the plan aims for (slice 8).

Revision ID: 0007
Revises: 0006
Create Date: 2026-10-26
"""

import sqlalchemy as sa
from alembic import op

revision = "0007"
down_revision = "0006"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "goals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("attribute_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=True),
        sa.Column("min", sa.Numeric(precision=15, scale=6), nullable=True),
        sa.Column("max", sa.Numeric(precision=15, scale=6), nullable=True),
        sa.Column("applies_to", sa.String(length=13), nullable=False),
        sa.Column("must", sa.Boolean(), nullable=False),
        sa.Column("importance", sa.Integer(), nullable=False),
        sa.Column("zero_reference", sa.Numeric(precision=15, scale=6), nullable=True),
        sa.Column("importance_below", sa.Integer(), nullable=True),
        sa.Column("importance_above", sa.Integer(), nullable=True),
        sa.Column("day_guard_rail", sa.Boolean(), nullable=False),
        sa.Column("guard_rail_importance", sa.Integer(), nullable=True),
        sa.ForeignKeyConstraint(["plan_id"], ["plan.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["attribute_id"], ["attributes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("goals")
