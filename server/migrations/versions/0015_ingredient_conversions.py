"""Recipe lines have a unit, and ingredients have conversions (slice R3).

Revision ID: 0015
Revises: 0014
Create Date: 2026-11-09
"""

import sqlalchemy as sa
from alembic import op

revision = "0015"
down_revision = "0014"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Every line so far is in its ingredient's own unit: empty.
    op.add_column("recipe_items", sa.Column("unit", sa.String(length=20), nullable=False, server_default=""))
    op.create_table(
        "ingredient_conversions",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("ingredient_id", sa.Integer(), nullable=False),
        sa.Column("unit", sa.String(length=20), nullable=False),
        sa.Column("factor", sa.Numeric(precision=15, scale=6), nullable=False),
        sa.Column("source", sa.String(length=4), nullable=False),
        sa.ForeignKeyConstraint(
            ["ingredient_id"], ["ingredients.id"], name="fk_ingredient_conversions_ingredient_id_ingredients",
            ondelete="CASCADE",
        ),
        sa.PrimaryKeyConstraint("id", name="pk_ingredient_conversions"),
        sa.UniqueConstraint("ingredient_id", "unit", name="uq_ingredient_conversions_ingredient_id_unit"),
    )


def downgrade() -> None:
    """Refused while a line has a unit, as its amount means nothing in the
    ingredient's unit. The conversions are dropped."""
    bind = op.get_bind()
    used = bind.execute(sa.text("SELECT count(*) FROM recipe_items WHERE unit <> ''")).scalar_one()
    if used:
        raise RuntimeError(
            f"{used} recipe line(s) are in a unit other than their ingredient's; "
            "change or remove them before downgrading"
        )
    op.drop_table("ingredient_conversions")
    with op.batch_alter_table("recipe_items") as batch:
        batch.drop_column("unit")
