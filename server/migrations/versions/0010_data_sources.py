"""The reference copy of the data files (slice D2): data sources, their
columns, foods, values and food tags, and `tags.source_id`.

Revision ID: 0010
Revises: 0009
Create Date: 2026-11-08
"""

import sqlalchemy as sa
from alembic import op

revision = "0010"
down_revision = "0009"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "data_sources",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=50), nullable=False),
        sa.Column("name", sa.String(length=100), nullable=False),
        sa.Column("colour", sa.String(length=7), nullable=False),
        sa.Column("version", sa.String(length=50), nullable=False),
        sa.Column("attribution", sa.Text(), nullable=True),
        sa.Column("imported_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("key"),
    )
    op.create_table(
        "source_columns",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("unit", sa.String(length=20), nullable=False),
        sa.Column("withdrawn", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["data_sources.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_id", "key", name="uq_source_columns_source_id_key"),
    )
    op.create_table(
        "source_foods",
        sa.Column("id", sa.Integer(), nullable=False),
        sa.Column("source_id", sa.Integer(), nullable=False),
        sa.Column("key", sa.String(length=100), nullable=False),
        sa.Column("name", sa.String(length=200), nullable=False),
        sa.Column("withdrawn", sa.Boolean(), server_default=sa.false(), nullable=False),
        sa.ForeignKeyConstraint(["source_id"], ["data_sources.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("source_id", "key", name="uq_source_foods_source_id_key"),
    )
    op.create_table(
        "source_food_values",
        sa.Column("food_id", sa.Integer(), nullable=False),
        sa.Column("column_id", sa.Integer(), nullable=False),
        sa.Column("value", sa.Numeric(precision=15, scale=6), nullable=False),
        sa.ForeignKeyConstraint(["food_id"], ["source_foods.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["column_id"], ["source_columns.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("food_id", "column_id"),
    )
    with op.batch_alter_table("tags") as batch:
        batch.add_column(sa.Column("source_id", sa.Integer(), nullable=True))
        batch.create_foreign_key("fk_tags_source_id_data_sources", "data_sources", ["source_id"], ["id"])
    op.create_table(
        "source_food_tags",
        sa.Column("food_id", sa.Integer(), nullable=False),
        sa.Column("tag_id", sa.Integer(), nullable=False),
        sa.ForeignKeyConstraint(["food_id"], ["source_foods.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["tag_id"], ["tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("food_id", "tag_id"),
    )


def downgrade() -> None:
    op.drop_table("source_food_tags")
    with op.batch_alter_table("tags") as batch:
        batch.drop_constraint("fk_tags_source_id_data_sources", type_="foreignkey")
        batch.drop_column("source_id")
    op.drop_table("source_food_values")
    op.drop_table("source_foods")
    op.drop_table("source_columns")
    op.drop_table("data_sources")
