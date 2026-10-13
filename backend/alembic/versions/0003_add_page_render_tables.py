"""Add crawl_page_renders table for dynamic JavaScript rendering results.

Revision ID: 0003_add_page_render_tables
Revises: 0002_add_crawler_tables
Create Date: 2026-10-13 06:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0003_add_page_render_tables"
down_revision: Union[str, None] = "0002_add_crawler_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "crawl_page_renders",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("crawl_page_id", sa.Uuid(), nullable=False),
        sa.Column("audit_id", sa.Uuid(), nullable=False),
        sa.Column("render_status", sa.String(length=50), nullable=False, server_default="success"),
        sa.Column("render_strategy", sa.String(length=50), nullable=False, server_default="HTTP_ONLY"),
        sa.Column("render_reason", sa.Text(), nullable=True),
        sa.Column("evidence_json", sa.JSON(), nullable=False),
        sa.Column("rendered_title", sa.String(length=500), nullable=True),
        sa.Column("rendered_meta_description", sa.String(length=1000), nullable=True),
        sa.Column("rendered_canonical_url", sa.String(length=2048), nullable=True),
        sa.Column("rendered_meta_robots", sa.String(length=255), nullable=True),
        sa.Column("rendered_headings_json", sa.JSON(), nullable=False),
        sa.Column("rendered_image_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rendered_link_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("comparison_json", sa.JSON(), nullable=False),
        sa.Column("performance_metrics_json", sa.JSON(), nullable=False),
        sa.Column("screenshot_desktop_path", sa.String(length=1024), nullable=True),
        sa.Column("screenshot_mobile_path", sa.String(length=1024), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("rendered_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["audit_id"], ["audits.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["crawl_page_id"], ["crawl_pages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("crawl_page_id")
    )
    op.create_index("ix_crawl_page_renders_audit_id", "crawl_page_renders", ["audit_id"], unique=False)
    op.create_index("ix_crawl_page_renders_render_status", "crawl_page_renders", ["render_status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_crawl_page_renders_render_status", table_name="crawl_page_renders")
    op.drop_index("ix_crawl_page_renders_audit_id", table_name="crawl_page_renders")
    op.drop_table("crawl_page_renders")
