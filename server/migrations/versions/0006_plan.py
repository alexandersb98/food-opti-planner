"""The plan setup: its days, meals, skipped cells and day minimums (slice 7).

Revision ID: 0006
Revises: 0005
Create Date: 2026-10-25
"""

import sqlalchemy as sa
from alembic import op

revision = "0006"
down_revision = "0005"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "plan",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("days", sa.Integer(), nullable=False),
        sa.Column("solve_time_limit", sa.Integer(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "plan_meals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.ForeignKeyConstraint(["plan_id"], ["plan.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "plan_skips",
        sa.Column("meal_id", sa.Integer(), nullable=False),
        sa.Column("day", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["meal_id"], ["plan_meals.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("meal_id", "day"),
    )
    op.create_table(
        "plan_day_minimums",
        sa.Column("plan_id", sa.Integer(), nullable=False),
        sa.Column("day", sa.Integer(), nullable=False),
        sa.Column("at_least", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["plan_id"], ["plan.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("plan_id", "day"),
    )


def downgrade() -> None:
    op.drop_table("plan_day_minimums")
    op.drop_table("plan_skips")
    op.drop_table("plan_meals")
    op.drop_table("plan")
