"""The recipes table, with its ingredient amounts and added tags (slice 6).

Revision ID: 0005
Revises: 0004
Create Date: 2026-10-24
"""

import sqlalchemy as sa
from alembic import op

revision = "0005"
down_revision = "0004"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "recipes",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("min_multiplier", sa.Numeric(precision=15, scale=6), nullable=False),
        sa.Column("max_multiplier", sa.Numeric(precision=15, scale=6), nullable=False),
        sa.Column("step", sa.Numeric(precision=15, scale=6), nullable=True),
        sa.Column("hard_max_multiplier", sa.Numeric(precision=15, scale=6), nullable=True),
        sa.Column("serving_cap_weight", sa.Numeric(precision=15, scale=6), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("name"),
    )
    op.create_table(
        "recipe_extra_tags",
        sa.Column("recipe_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("recipe_id", "tag_id"),
    )
    op.create_table(
        "recipe_items",
        sa.Column("recipe_id", sa.Integer(), nullable=False),
        sa.Column("ingredient_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=15, scale=6), nullable=False),
        sa.ForeignKeyConstraint(["ingredient_id"], ["ingredients.id"], ondelete="RESTRICT"),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("recipe_id", "ingredient_id"),
    )


def downgrade() -> None:
    op.drop_table("recipe_items")
    op.drop_table("recipe_extra_tags")
    op.drop_table("recipes")
