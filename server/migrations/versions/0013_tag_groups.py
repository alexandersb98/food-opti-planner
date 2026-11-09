"""Tag groups: sets of equivalent tags (slice D6).

Revision ID: 0013
Revises: 0012
Create Date: 2026-11-09
"""

import sqlalchemy as sa
from alembic import op

revision = "0013"
down_revision = "0012"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table("tag_groups", sa.Column("id", sa.Integer(), primary_key=True))
    # Batch mode: SQLite cannot add a foreign key by ALTER.
    with op.batch_alter_table("tags") as batch:
        batch.add_column(sa.Column("group_id", sa.Integer(), nullable=True))
        batch.create_foreign_key(
            "fk_tags_group_id_tag_groups", "tag_groups", ["group_id"], ["id"], ondelete="SET NULL"
        )
        batch.create_index("ix_tags_group_id", ["group_id"])


def downgrade() -> None:
    with op.batch_alter_table("tags") as batch:
        batch.drop_index("ix_tags_group_id")
        batch.drop_constraint("fk_tags_group_id_tag_groups", type_="foreignkey")
        batch.drop_column("group_id")
    op.drop_table("tag_groups")
