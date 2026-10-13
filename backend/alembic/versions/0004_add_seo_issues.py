"""Add seo_issues table for deterministic SEO rule engine assessments.

Revision ID: 0004_add_seo_issues
Revises: 0003_add_page_render_tables
Create Date: 2026-10-13 12:00:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0004_add_seo_issues"
down_revision: Union[str, None] = "0003_add_page_render_tables"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "seo_issues",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("audit_id", sa.Uuid(), nullable=False),
        sa.Column("crawl_page_id", sa.Uuid(), nullable=True),
        sa.Column("rule_id", sa.String(length=100), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("subcategory", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False),
        sa.Column("severity", sa.String(length=20), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False),
        sa.Column("evidence_json", sa.JSON(), nullable=False),
        sa.Column("recommendation", sa.Text(), nullable=False),
        sa.Column("source_type", sa.String(length=30), nullable=False, server_default="raw_http"),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="1.0"),
        sa.Column("documentation_url", sa.String(length=2048), nullable=True),
        sa.Column("rule_version", sa.String(length=20), nullable=False, server_default="1.0.0"),
        sa.Column("fingerprint", sa.String(length=64), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["audit_id"], ["audits.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["crawl_page_id"], ["crawl_pages.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )

    op.create_index("ix_seo_issues_audit_id", "seo_issues", ["audit_id"], unique=False)
    op.create_index("ix_seo_issues_crawl_page_id", "seo_issues", ["crawl_page_id"], unique=False)
    op.create_index("ix_seo_issues_rule_id", "seo_issues", ["rule_id"], unique=False)
    op.create_index("ix_seo_issues_category", "seo_issues", ["category"], unique=False)
    op.create_index("ix_seo_issues_severity", "seo_issues", ["severity"], unique=False)
    op.create_index("ix_seo_issues_status", "seo_issues", ["status"], unique=False)
    op.create_index("ix_seo_issues_fingerprint", "seo_issues", ["fingerprint"], unique=False)
    op.create_index("ix_seo_issues_audit_fingerprint", "seo_issues", ["audit_id", "fingerprint"], unique=False)
    op.create_index("ix_seo_issues_audit_category", "seo_issues", ["audit_id", "category"], unique=False)
    op.create_index("ix_seo_issues_audit_severity", "seo_issues", ["audit_id", "severity"], unique=False)
    op.create_index("ix_seo_issues_audit_status", "seo_issues", ["audit_id", "status"], unique=False)


def downgrade() -> None:
    op.drop_index("ix_seo_issues_audit_status", table_name="seo_issues")
    op.drop_index("ix_seo_issues_audit_severity", table_name="seo_issues")
    op.drop_index("ix_seo_issues_audit_category", table_name="seo_issues")
    op.drop_index("ix_seo_issues_audit_fingerprint", table_name="seo_issues")
    op.drop_index("ix_seo_issues_fingerprint", table_name="seo_issues")
    op.drop_index("ix_seo_issues_status", table_name="seo_issues")
    op.drop_index("ix_seo_issues_severity", table_name="seo_issues")
    op.drop_index("ix_seo_issues_category", table_name="seo_issues")
    op.drop_index("ix_seo_issues_rule_id", table_name="seo_issues")
    op.drop_index("ix_seo_issues_crawl_page_id", table_name="seo_issues")
    op.drop_index("ix_seo_issues_audit_id", table_name="seo_issues")
    op.drop_table("seo_issues")
