"""Add site-wide intelligence, content fingerprints, and finding groups.

Revision ID: 0006_add_sitewide_intelligence
Revises: 0005_add_technical_seo_evidence
Create Date: 2026-10-13 18:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0006_add_sitewide_intelligence"
down_revision: Union[str, None] = "0005_add_technical_seo_evidence"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Update crawl_pages with content fingerprints, quality, and canonical details
    with op.batch_alter_table("crawl_pages", schema=None) as batch_op:
        batch_op.alter_column("canonical_tag_count", nullable=True, server_default=None)
        batch_op.add_column(sa.Column("canonical_hrefs_json", sa.JSON(), nullable=True))
        batch_op.add_column(sa.Column("normalized_main_text_hash", sa.String(length=64), nullable=True))
        batch_op.add_column(sa.Column("main_text_simhash", sa.String(length=16), nullable=True))
        batch_op.add_column(sa.Column("main_text_word_count", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("main_text_character_count", sa.Integer(), nullable=True))
        batch_op.add_column(sa.Column("extraction_source", sa.String(length=32), nullable=True))
        batch_op.add_column(sa.Column("extraction_version", sa.String(length=16), nullable=True))
        batch_op.add_column(sa.Column("content_quality_status", sa.String(length=32), nullable=True))
        batch_op.create_index("ix_crawl_pages_main_text_hash", ["normalized_main_text_hash"])
        batch_op.create_index("ix_crawl_pages_simhash", ["main_text_simhash"])

    # 2. Create site_finding_groups table for persisted duplicate groups and link graph intelligence
    op.create_table(
        "site_finding_groups",
        sa.Column("id", sa.UUID(), nullable=False),
        sa.Column("audit_id", sa.UUID(), nullable=False),
        sa.Column("rule_id", sa.String(length=100), nullable=False),
        sa.Column("rule_version", sa.String(length=20), nullable=False, server_default="1.0.0"),
        sa.Column("group_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("group_type", sa.String(length=50), nullable=False),
        sa.Column("affected_page_ids_json", sa.JSON(), nullable=False),
        sa.Column("affected_urls_json", sa.JSON(), nullable=False),
        sa.Column("evidence_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["audit_id"], ["audits.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_site_finding_groups_audit_id", "site_finding_groups", ["audit_id"])
    op.create_index("ix_site_finding_groups_rule_id", "site_finding_groups", ["rule_id"])
    op.create_index(
        "ix_site_finding_groups_fingerprint",
        "site_finding_groups",
        ["audit_id", "group_fingerprint"],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index("ix_site_finding_groups_fingerprint", table_name="site_finding_groups")
    op.drop_index("ix_site_finding_groups_rule_id", table_name="site_finding_groups")
    op.drop_index("ix_site_finding_groups_audit_id", table_name="site_finding_groups")
    op.drop_table("site_finding_groups")

    with op.batch_alter_table("crawl_pages", schema=None) as batch_op:
        batch_op.drop_index("ix_crawl_pages_simhash")
        batch_op.drop_index("ix_crawl_pages_main_text_hash")
        batch_op.drop_column("content_quality_status")
        batch_op.drop_column("extraction_version")
        batch_op.drop_column("extraction_source")
        batch_op.drop_column("main_text_character_count")
        batch_op.drop_column("main_text_word_count")
        batch_op.drop_column("main_text_simhash")
        batch_op.drop_column("normalized_main_text_hash")
        batch_op.drop_column("canonical_hrefs_json")
        batch_op.alter_column("canonical_tag_count", nullable=False, server_default="1")
