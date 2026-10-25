"""The plan setup: its days, meals, skipped cells and day minimums; and the
plans made from it, frozen: their attributes, meals, scaled ingredients and
totals (slice 7).

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
    op.create_table(
        "plan_results",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("saved", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("saved_at", sa.DateTime(), nullable=True),
        sa.Column("chosen_at", sa.DateTime(), nullable=True),
        sa.Column("start_date", sa.Date(), nullable=False),
        sa.Column("days", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=12), nullable=False),
        sa.PrimaryKeyConstraint("id"),
    )
    # At most one unsaved plan.
    op.create_index(
        "plan_results_one_unsaved",
        "plan_results",
        ["saved"],
        unique=True,
        sqlite_where=sa.text("NOT saved"),
        postgresql_where=sa.text("NOT saved"),
    )
    op.create_table(
        "plan_result_attributes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("plan_result_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("unit", sa.String(length=20), nullable=False),
        sa.Column("decimals", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["plan_result_id"], ["plan_results.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "plan_result_meals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("plan_result_id", sa.Integer(), nullable=False),
        sa.Column("day", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=40), nullable=False),
        sa.Column("planned", sa.Boolean(), nullable=False),
        sa.Column("recipe", sa.String(length=100), nullable=True),
        sa.Column("portion", sa.Numeric(precision=15, scale=6), nullable=True),
        sa.ForeignKeyConstraint(["plan_result_id"], ["plan_results.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_table(
        "plan_result_meal_items",
        sa.Column("meal_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("ingredient", sa.String(length=100), nullable=False),
        sa.Column("unit", sa.String(length=20), nullable=False),
        sa.Column("amount", sa.Numeric(precision=15, scale=6), nullable=False),
        sa.ForeignKeyConstraint(["meal_id"], ["plan_result_meals.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("meal_id", "position"),
    )
    op.create_table(
        "plan_result_totals",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("plan_result_id", sa.Integer(), nullable=False),
        sa.Column("attribute_id", sa.Integer(), nullable=False),
        sa.Column("meal_id", sa.Integer(), nullable=True),
        sa.Column("day", sa.Integer(), nullable=True),
        sa.Column("value", sa.Numeric(precision=15, scale=6), nullable=False),
        sa.ForeignKeyConstraint(["plan_result_id"], ["plan_results.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["attribute_id"], ["plan_result_attributes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["meal_id"], ["plan_result_meals.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )


def downgrade() -> None:
    op.drop_table("plan_result_totals")
    op.drop_table("plan_result_meal_items")
    op.drop_table("plan_result_meals")
    op.drop_table("plan_result_attributes")
    op.drop_index("plan_results_one_unsaved", table_name="plan_results")
    op.drop_table("plan_results")
    op.drop_table("plan_day_minimums")
    op.drop_table("plan_skips")
    op.drop_table("plan_meals")
    op.drop_table("plan")
