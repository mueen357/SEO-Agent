"""Add crawler tables and worker lease columns to audits.

Revision ID: 0002_add_crawler_tables
Revises: 0001_initial_audit_tables
Create Date: 2026-10-13 00:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = "0002_add_crawler_tables"
down_revision: Union[str, None] = "0001_initial_audit_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add worker lease columns to audits table
    with op.batch_alter_table("audits", schema=None) as batch_op:
        batch_op.add_column(sa.Column("worker_token", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("lease_expires_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("heartbeat_at", sa.DateTime(timezone=True), nullable=True))
        batch_op.add_column(sa.Column("progress_json", sa.JSON(), nullable=False, server_default="{}"))
        batch_op.create_index("ix_audits_worker_token", ["worker_token"], unique=False)
        batch_op.create_index("ix_audits_lease_expires_at", ["lease_expires_at"], unique=False)

    # 2. Create crawl_pages table
    op.create_table(
        "crawl_pages",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("audit_id", sa.Uuid(), nullable=False),
        sa.Column("requested_url", sa.String(length=2048), nullable=False),
        sa.Column("final_url", sa.String(length=2048), nullable=False),
        sa.Column("depth", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("fetch_status", sa.String(length=32), nullable=False, server_default="success"),
        sa.Column("http_status", sa.Integer(), nullable=True),
        sa.Column("content_type", sa.String(length=128), nullable=True),
        sa.Column("response_time_ms", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("redirect_chain_json", sa.JSON(), nullable=True),
        sa.Column("title", sa.String(length=512), nullable=True),
        sa.Column("meta_description", sa.String(length=1024), nullable=True),
        sa.Column("canonical_url", sa.String(length=2048), nullable=True),
        sa.Column("meta_robots", sa.String(length=256), nullable=True),
        sa.Column("html_lang", sa.String(length=64), nullable=True),
        sa.Column("headings_json", sa.JSON(), nullable=True),
        sa.Column("image_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("missing_alt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("empty_alt_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("internal_link_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("external_link_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("content_hash", sa.String(length=64), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("fetched_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["audit_id"], ["audits.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("crawl_pages", schema=None) as batch_op:
        batch_op.create_index("ix_crawl_pages_audit_id", ["audit_id"], unique=False)
        batch_op.create_index("ix_crawl_pages_requested_url", ["requested_url"], unique=False)
        batch_op.create_index("ix_crawl_pages_final_url", ["final_url"], unique=False)
        batch_op.create_index("ix_crawl_pages_fetch_status", ["fetch_status"], unique=False)

    # 3. Create crawl_links table
    op.create_table(
        "crawl_links",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("audit_id", sa.Uuid(), nullable=False),
        sa.Column("source_page_id", sa.Uuid(), nullable=False),
        sa.Column("destination_url", sa.String(length=2048), nullable=False),
        sa.Column("link_text", sa.String(length=512), nullable=False, server_default=""),
        sa.Column("internal", sa.Boolean(), nullable=False, server_default="1"),
        sa.Column("discovered_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["audit_id"], ["audits.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["source_page_id"], ["crawl_pages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("crawl_links", schema=None) as batch_op:
        batch_op.create_index("ix_crawl_links_audit_id", ["audit_id"], unique=False)
        batch_op.create_index("ix_crawl_links_source_page_id", ["source_page_id"], unique=False)
        batch_op.create_index("ix_crawl_links_destination_url", ["destination_url"], unique=False)

    # 4. Create crawl_sitemaps table
    op.create_table(
        "crawl_sitemaps",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("audit_id", sa.Uuid(), nullable=False),
        sa.Column("sitemap_url", sa.String(length=2048), nullable=False),
        sa.Column("status", sa.String(length=32), nullable=False, server_default="success"),
        sa.Column("url_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("discovered_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["audit_id"], ["audits.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    with op.batch_alter_table("crawl_sitemaps", schema=None) as batch_op:
        batch_op.create_index("ix_crawl_sitemaps_audit_id", ["audit_id"], unique=False)
        batch_op.create_index("ix_crawl_sitemaps_status", ["status"], unique=False)


def downgrade() -> None:
    # Drop tables in reverse order
    op.drop_table("crawl_sitemaps")
    op.drop_table("crawl_links")
    op.drop_table("crawl_pages")

    # Drop added columns from audits
    with op.batch_alter_table("audits", schema=None) as batch_op:
        batch_op.drop_index("ix_audits_lease_expires_at")
        batch_op.drop_index("ix_audits_worker_token")
        batch_op.drop_column("progress_json")
        batch_op.drop_column("heartbeat_at")
        batch_op.drop_column("lease_expires_at")
        batch_op.drop_column("worker_token")
