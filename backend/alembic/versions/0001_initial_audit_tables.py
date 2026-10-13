"""Initial audit and idempotency tables

Revision ID: 0001_initial_audit_tables
Revises: 
Create Date: 2026-10-13 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = '0001_initial_audit_tables'
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # 1. Create audits table
    op.create_table(
        'audits',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('target_url', sa.String(length=2048), nullable=False),
        sa.Column('normalized_url', sa.String(length=2048), nullable=False),
        sa.Column('hostname', sa.String(length=255), nullable=False),
        sa.Column('mode', sa.String(length=50), nullable=False),
        sa.Column('status', sa.String(length=50), nullable=False),
        sa.Column('max_pages', sa.Integer(), nullable=False),
        sa.Column('pages_discovered', sa.Integer(), nullable=False),
        sa.Column('pages_crawled', sa.Integer(), nullable=False),
        sa.Column('configuration_json', sa.JSON(), nullable=False),
        sa.Column('error_message', sa.Text(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('started_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('completed_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_audits_created_at'), 'audits', ['created_at'], unique=False)
    op.create_index(op.f('ix_audits_hostname'), 'audits', ['hostname'], unique=False)
    op.create_index(op.f('ix_audits_status'), 'audits', ['status'], unique=False)
    op.create_index('ix_audits_status_created_at', 'audits', ['status', 'created_at'], unique=False)
    op.create_index('ix_audits_hostname_created_at', 'audits', ['hostname', 'created_at'], unique=False)

    # 2. Create idempotency_records table
    op.create_table(
        'idempotency_records',
        sa.Column('id', sa.Uuid(), nullable=False),
        sa.Column('idempotency_key', sa.String(length=255), nullable=False),
        sa.Column('request_hash', sa.String(length=64), nullable=False),
        sa.Column('audit_id', sa.Uuid(), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['audit_id'], ['audits.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_idempotency_records_idempotency_key'), 'idempotency_records', ['idempotency_key'], unique=True)


def downgrade() -> None:
    op.drop_index(op.f('ix_idempotency_records_idempotency_key'), table_name='idempotency_records')
    op.drop_table('idempotency_records')

    op.drop_index('ix_audits_hostname_created_at', table_name='audits')
    op.drop_index('ix_audits_status_created_at', table_name='audits')
    op.drop_index(op.f('ix_audits_status'), table_name='audits')
    op.drop_index(op.f('ix_audits_hostname'), table_name='audits')
    op.drop_index(op.f('ix_audits_created_at'), table_name='audits')
    op.drop_table('audits')
