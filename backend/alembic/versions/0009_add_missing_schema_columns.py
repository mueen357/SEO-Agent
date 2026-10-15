"""Add missing schema columns for audits, crawl_pages, and crawl_page_renders.

Revision ID: 0009_add_missing_schema_columns
Revises: 0008_add_technology_detection_tables
Create Date: 2026-10-16 02:45:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0009_add_missing_schema_columns"
down_revision: Union[str, None] = "0008_add_technology_detection_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add urls_json to audits
    with op.batch_alter_table("audits", schema=None) as batch_op:
        batch_op.add_column(sa.Column("urls_json", sa.JSON(), nullable=True))

    # 2. Add urls_json to crawl_pages
    with op.batch_alter_table("crawl_pages", schema=None) as batch_op:
        batch_op.add_column(sa.Column("urls_json", sa.JSON(), nullable=True))

    # 3. Add canonical_tag_count and urls_json to crawl_page_renders
    with op.batch_alter_table("crawl_page_renders", schema=None) as batch_op:
        batch_op.add_column(
            sa.Column("canonical_tag_count", sa.Integer(), nullable=False, server_default="1")
        )
        batch_op.add_column(sa.Column("urls_json", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("crawl_page_renders", schema=None) as batch_op:
        batch_op.drop_column("urls_json")
        batch_op.drop_column("canonical_tag_count")

    with op.batch_alter_table("crawl_pages", schema=None) as batch_op:
        batch_op.drop_column("urls_json")

    with op.batch_alter_table("audits", schema=None) as batch_op:
        batch_op.drop_column("urls_json")
