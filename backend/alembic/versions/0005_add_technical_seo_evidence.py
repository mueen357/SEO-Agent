"""Add technical SEO evidence columns to crawl_pages, crawl_sitemaps, and audits.

Revision ID: 0005_add_technical_seo_evidence
Revises: 0004_add_seo_issues
Create Date: 2026-10-13 14:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0005_add_technical_seo_evidence"
down_revision: Union[str, None] = "0004_add_seo_issues"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add headers_json and canonical_tag_count to crawl_pages
    with op.batch_alter_table("crawl_pages", schema=None) as batch_op:
        batch_op.add_column(sa.Column("headers_json", sa.JSON(), nullable=True))
        batch_op.add_column(
            sa.Column("canonical_tag_count", sa.Integer(), nullable=False, server_default="1")
        )

    # 2. Add urls_json to crawl_sitemaps
    with op.batch_alter_table("crawl_sitemaps", schema=None) as batch_op:
        batch_op.add_column(sa.Column("urls_json", sa.JSON(), nullable=True))

    # 3. Add robots_txt_status and robots_txt_content to audits
    with op.batch_alter_table("audits", schema=None) as batch_op:
        batch_op.add_column(sa.Column("robots_txt_status", sa.String(length=50), nullable=True))
        batch_op.add_column(sa.Column("robots_txt_content", sa.Text(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("audits", schema=None) as batch_op:
        batch_op.drop_column("robots_txt_content")
        batch_op.drop_column("robots_txt_status")

    with op.batch_alter_table("crawl_sitemaps", schema=None) as batch_op:
        batch_op.drop_column("urls_json")

    with op.batch_alter_table("crawl_pages", schema=None) as batch_op:
        batch_op.drop_column("canonical_tag_count")
        batch_op.drop_column("headers_json")
