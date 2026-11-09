"""An ingredient's link to a source food and the source values copied (slice D4).

Revision ID: 0012
Revises: 0011
Create Date: 2026-11-09
"""

import sqlalchemy as sa
from alembic import op

revision = "0012"
down_revision = "0011"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Batch mode: SQLite cannot add a foreign key by ALTER.
    with op.batch_alter_table("ingredients") as batch:
        batch.add_column(sa.Column("source_food_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_ingredients_source_food_id_source_foods", "source_foods", ["source_food_id"], ["id"]
        )
        batch.create_index("ix_ingredients_source_food_id", ["source_food_id"])
    with op.batch_alter_table("ingredient_values") as batch:
        batch.add_column(sa.Column("source_value", sa.Numeric(15, 6), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("ingredient_values") as batch:
        batch.drop_column("source_value")
    with op.batch_alter_table("ingredients") as batch:
        batch.drop_index("ix_ingredients_source_food_id")
        batch.drop_constraint("fk_ingredients_source_food_id_source_foods", type_="foreignkey")
        batch.drop_column("source_food_id")
