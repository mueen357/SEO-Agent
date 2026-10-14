"""Add audit scorecards and priority items tables.

Revision ID: 0007_add_scoring_and_priorities
Revises: 0006_add_sitewide_intelligence
Create Date: 2026-10-14 07:30:00.000000
"""

from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

revision: str = "0007_add_scoring_and_priorities"
down_revision: Union[str, None] = "0006_add_sitewide_intelligence"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create audit_scorecards table
    op.create_table(
        "audit_scorecards",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("audit_id", sa.Uuid(), nullable=False),
        sa.Column("policy_version", sa.String(length=20), nullable=False, server_default="2.4.0"),
        sa.Column("input_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("overall_score", sa.Float(), nullable=True),
        sa.Column("score_label", sa.String(length=20), nullable=False, server_default="unrated"),
        sa.Column("overall_state", sa.String(length=30), nullable=False, server_default="available"),
        sa.Column("on_page_score", sa.Float(), nullable=True),
        sa.Column("technical_score", sa.Float(), nullable=True),
        sa.Column("sitewide_score", sa.Float(), nullable=True),
        sa.Column("category_scores_json", sa.JSON(), nullable=False),
        sa.Column("coverage_json", sa.JSON(), nullable=False),
        sa.Column("explanation_json", sa.JSON(), nullable=False),
        sa.Column("pages_evaluated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("rules_evaluated", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("critical_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("high_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("medium_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("low_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("pass_count", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["audit_id"], ["audits.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_scorecards_audit_id", "audit_scorecards", ["audit_id"], unique=True)
    op.create_index("ix_audit_scorecards_overall_state", "audit_scorecards", ["overall_state"])
    op.create_index("ix_audit_scorecards_fingerprint", "audit_scorecards", ["input_fingerprint"])

    # 2. Create audit_priority_items table
    op.create_table(
        "audit_priority_items",
        sa.Column("id", sa.Uuid(), nullable=False),
        sa.Column("audit_id", sa.Uuid(), nullable=False),
        sa.Column("scorecard_id", sa.Uuid(), nullable=True),
        sa.Column("priority_tier", sa.String(length=5), nullable=False),
        sa.Column("priority_rank", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("group_fingerprint", sa.String(length=64), nullable=False),
        sa.Column("rule_id", sa.String(length=100), nullable=False),
        sa.Column("category", sa.String(length=50), nullable=False),
        sa.Column("title", sa.String(length=255), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("recommendation", sa.Text(), nullable=False),
        sa.Column("affected_page_count", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("affected_urls_json", sa.JSON(), nullable=False),
        sa.Column("rule_ids_json", sa.JSON(), nullable=False),
        sa.Column("evidence_json", sa.JSON(), nullable=False),
        sa.Column("score_impact", sa.Float(), nullable=False, server_default="0.0"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(["audit_id"], ["audits.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["scorecard_id"], ["audit_scorecards.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_audit_priority_items_audit_tier", "audit_priority_items", ["audit_id", "priority_tier"])
    op.create_index("ix_audit_priority_items_audit_rank", "audit_priority_items", ["audit_id", "priority_rank"])
    op.create_index("ix_audit_priority_items_group_fingerprint", "audit_priority_items", ["audit_id", "group_fingerprint"], unique=True)
    op.create_index("ix_audit_priority_items_scorecard_id", "audit_priority_items", ["scorecard_id"])
    op.create_index("ix_audit_priority_items_rule_id", "audit_priority_items", ["rule_id"])
    op.create_index("ix_audit_priority_items_category", "audit_priority_items", ["category"])


def downgrade() -> None:
    op.drop_table("audit_priority_items")
    op.drop_table("audit_scorecards")
