"""Column mapping (slice D3): the attribute a data source column feeds.

Revision ID: 0011
Revises: 0010
Create Date: 2026-11-09
"""

import sqlalchemy as sa
from alembic import op

revision = "0011"
down_revision = "0010"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Batch mode: SQLite cannot add a foreign key or a constraint by ALTER.
    with op.batch_alter_table("source_columns") as batch:
        batch.add_column(sa.Column("attribute_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_source_columns_attribute_id_attributes",
            "attributes",
            ["attribute_id"],
            ["id"],
            ondelete="SET NULL",
        )
        batch.create_unique_constraint(
            "uq_source_columns_source_id_attribute_id", ["source_id", "attribute_id"]
        )


def downgrade() -> None:
    with op.batch_alter_table("source_columns") as batch:
        batch.drop_constraint("uq_source_columns_source_id_attribute_id", type_="unique")
        batch.drop_constraint("fk_source_columns_attribute_id_attributes", type_="foreignkey")
        batch.drop_column("attribute_id")
