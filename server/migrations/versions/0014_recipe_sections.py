"""Recipes with servings, sections, instructions and a source link; a recipe's
lines get their own id, a section, and the text they were imported from
(slice R2).

Revision ID: 0014
Revises: 0013
Create Date: 2026-11-09
"""

from decimal import ROUND_HALF_UP, Decimal

import sqlalchemy as sa
from alembic import op

revision = "0014"
down_revision = "0013"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # No ALTER ... DROP/ALTER COLUMN, which SQLite lacks: the lines move into
    # a new table, which then takes the old one's name.
    op.add_column("recipes", sa.Column("servings", sa.Integer(), nullable=False, server_default="1"))
    op.add_column("recipes", sa.Column("instructions", sa.Text(), nullable=False, server_default=""))
    op.add_column("recipes", sa.Column("source_url", sa.String(length=2000), nullable=False, server_default=""))
    op.create_table(
        "recipe_sections",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("recipe_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.ForeignKeyConstraint(["recipe_id"], ["recipes.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    # Every recipe so far is one unnamed section.
    op.execute("INSERT INTO recipe_sections (recipe_id, position, name) SELECT id, 0, '' FROM recipes")
    # The old table steps aside and the new one is created under the final
    # name, so no "_new" sequence or constraint name is left behind; its
    # constraints are named, so they cannot clash with the old table's.
    op.rename_table("recipe_items", "recipe_items_old")
    op.create_table(
        "recipe_items",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("section_id", sa.Integer(), nullable=False),
        sa.Column("position", sa.Integer(), nullable=False),
        sa.Column("ingredient_id", sa.Integer(), nullable=False),
        sa.Column("amount", sa.Numeric(precision=15, scale=6), nullable=False),
        sa.Column("original_text", sa.String(length=500), nullable=False),
        sa.ForeignKeyConstraint(
            ["section_id"], ["recipe_sections.id"], name="fk_recipe_items_section_id_recipe_sections",
            ondelete="CASCADE",
        ),
        sa.ForeignKeyConstraint(
            ["ingredient_id"], ["ingredients.id"], name="fk_recipe_items_ingredient_id_ingredients",
            ondelete="RESTRICT",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_recipe_items"),
    )
    op.execute(
        "INSERT INTO recipe_items (section_id, position, ingredient_id, amount, original_text) "
        "SELECT s.id, i.position, i.ingredient_id, i.amount, '' "
        "FROM recipe_items_old i JOIN recipe_sections s ON s.recipe_id = i.recipe_id "
        "ORDER BY i.recipe_id, i.position"
    )
    op.drop_table("recipe_items_old")


def downgrade() -> None:
    """Lossy: each ingredient's lines of a recipe are summed and divided by
    the servings (6 decimals), in the order of the first line; the sections,
    instructions and source link are dropped."""
    bind = op.get_bind()
    rows = bind.execute(sa.text(
        "SELECT s.recipe_id, i.ingredient_id, i.amount, r.servings "
        "FROM recipe_items i JOIN recipe_sections s ON s.id = i.section_id "
        "JOIN recipes r ON r.id = s.recipe_id "
        "ORDER BY s.recipe_id, s.position, i.position, i.id"
    )).all()
    totals: dict[tuple[int, int], list] = {}
    order: dict[int, int] = {}
    for recipe_id, ingredient_id, amount, servings in rows:
        key = (recipe_id, ingredient_id)
        if key not in totals:
            totals[key] = [order.get(recipe_id, 0), Decimal(0), servings]
            order[recipe_id] = totals[key][0] + 1
        totals[key][1] += Decimal(str(amount))
    old = [
        {
            "recipe_id": recipe_id,
            "ingredient_id": ingredient_id,
            "position": position,
            "amount": (total / servings).quantize(Decimal("0.000001"), rounding=ROUND_HALF_UP),
        }
        for (recipe_id, ingredient_id), (position, total, servings) in totals.items()
    ]
    op.drop_table("recipe_items")
    op.drop_table("recipe_sections")
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
    if old:
        items = sa.table(
            "recipe_items",
            sa.column("recipe_id", sa.Integer),
            sa.column("ingredient_id", sa.Integer),
            sa.column("position", sa.Integer),
            sa.column("amount", sa.Numeric(15, 6)),
        )
        op.bulk_insert(items, old)
    with op.batch_alter_table("recipes") as batch:
        batch.drop_column("source_url")
        batch.drop_column("instructions")
        batch.drop_column("servings")
