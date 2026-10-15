"""Add technology detection tables and crawl page technology evidence column.

Revision ID: 0008_add_technology_detection_tables
Revises: 0007_add_scoring_and_priorities
Create Date: 2026-10-15 08:30:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0008_add_technology_detection_tables"
down_revision: Union[str, None] = "0007_add_scoring_and_priorities"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Add technology_evidence_json to crawl_pages
    with op.batch_alter_table("crawl_pages") as batch_op:
        batch_op.add_column(
            sa.Column("technology_evidence_json", sa.JSON(), nullable=False, server_default="{}")
        )

    # 2. Create audit_technologies table
    op.create_table(
        "audit_technologies",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("audit_id", sa.Uuid(), nullable=False),
        sa.Column("technology_id", sa.String(length=50), nullable=False),
        sa.Column("technology_name", sa.String(length=100), nullable=False),
        sa.Column("technology_category", sa.String(length=50), nullable=False),
        sa.Column("status", sa.String(length=20), nullable=False, server_default="detected"),
        sa.Column("confidence", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("confidence_level", sa.String(length=20), nullable=False, server_default="low"),
        sa.Column("version_or_null", sa.String(length=50), nullable=True),
        sa.Column("evidence_type", sa.String(length=50), nullable=False),
        sa.Column("evidence_source", sa.String(length=255), nullable=False),
        sa.Column("evidence_summary", sa.Text(), nullable=False),
        sa.Column("observed_page_or_url", sa.String(length=2048), nullable=False),
        sa.Column("detection_method", sa.String(length=50), nullable=False),
        sa.Column("page_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("affected_urls_json", sa.JSON(), nullable=False),
        sa.Column("evidence_items_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["audit_id"], ["audits.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_technologies_audit_tech", "audit_technologies", ["audit_id", "technology_id"], unique=True)
    op.create_index("ix_audit_technologies_audit_category", "audit_technologies", ["audit_id", "technology_category"])
    op.create_index("ix_audit_technologies_audit_status", "audit_technologies", ["audit_id", "status"])

    # 3. Create audit_technology_summaries table
    op.create_table(
        "audit_technology_summaries",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("audit_id", sa.Uuid(), nullable=False),
        sa.Column("primary_cms", sa.String(length=100), nullable=True),
        sa.Column("frontend_frameworks_json", sa.JSON(), nullable=False),
        sa.Column("backend_runtimes_json", sa.JSON(), nullable=False),
        sa.Column("total_detected", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("detected_technologies_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("possible_technologies_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("confidence_distribution_json", sa.JSON(), nullable=False),
        sa.Column("wordpress_themes_json", sa.JSON(), nullable=False),
        sa.Column("wordpress_plugins_json", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["audit_id"], ["audits.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_technology_summaries_audit_id", "audit_technology_summaries", ["audit_id"], unique=True)


def downgrade() -> None:
    # 1. Drop audit_technology_summaries
    op.drop_index("ix_audit_technology_summaries_audit_id", table_name="audit_technology_summaries")
    op.drop_table("audit_technology_summaries")

    # 2. Drop audit_technologies
    op.drop_index("ix_audit_technologies_audit_status", table_name="audit_technologies")
    op.drop_index("ix_audit_technologies_audit_category", table_name="audit_technologies")
    op.drop_index("ix_audit_technologies_audit_tech", table_name="audit_technologies")
    op.drop_table("audit_technologies")

    # 3. Remove technology_evidence_json from crawl_pages
    with op.batch_alter_table("crawl_pages") as batch_op:
        batch_op.drop_column("technology_evidence_json")
