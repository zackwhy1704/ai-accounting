"""MyInvois e-Invoice: submission tracking table + org supplier profile.

- einvoice_submissions: one row per document submitted to LHDN, storing the
  submission UID, document UUID, long ID (validation link/QR), status and the
  cancellation window timestamps.
- organizations: supplier-party fields the UBL payload requires (BRN, MSIC,
  phone/email, structured address, LHDN state code).

Revision ID: a036
Revises: a035
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID, JSONB

revision = "a036"
down_revision = "a035"
branch_labels = None
depends_on = None

ORG_COLUMNS = [
    ("brn", sa.String(50)),
    ("msic_code", sa.String(10)),
    ("msic_description", sa.String(300)),
    ("einvoice_phone", sa.String(30)),
    ("einvoice_email", sa.String(255)),
    ("einvoice_address_line1", sa.String(255)),
    ("einvoice_city", sa.String(100)),
    ("einvoice_postcode", sa.String(20)),
    ("einvoice_state_code", sa.String(2)),
]


def upgrade() -> None:
    op.create_table(
        "einvoice_submissions",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("source_type", sa.String(20), nullable=False, server_default="invoice"),
        sa.Column("source_id", UUID(as_uuid=True), nullable=True),
        sa.Column("doc_type_code", sa.String(2), nullable=False, server_default="01"),
        sa.Column("doc_number", sa.String(50), nullable=False),
        sa.Column("total", sa.Numeric(15, 2), nullable=False, server_default="0"),
        sa.Column("currency", sa.String(3), nullable=False, server_default="MYR"),
        sa.Column("submission_uid", sa.String(50), nullable=True),
        sa.Column("document_uuid", sa.String(50), nullable=True),
        sa.Column("long_id", sa.String(100), nullable=True),
        sa.Column("document_hash", sa.String(64), nullable=True),
        sa.Column("status", sa.String(20), nullable=False, server_default="pending"),
        sa.Column("status_reason", sa.Text(), nullable=True),
        sa.Column("validation_link", sa.String(500), nullable=True),
        sa.Column("submitted_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("validated_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancelled_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("cancellation_reason", sa.Text(), nullable=True),
        sa.Column("raw_response", JSONB(), nullable=True),
        sa.Column("sandbox", sa.Boolean(), nullable=True, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
    )
    op.create_index("ix_einvoice_org_source", "einvoice_submissions", ["organization_id", "source_type", "source_id"])
    op.create_index("ix_einvoice_org_status", "einvoice_submissions", ["organization_id", "status"])
    op.create_index("ix_einvoice_submissions_submission_uid", "einvoice_submissions", ["submission_uid"])
    op.create_index("ix_einvoice_submissions_document_uuid", "einvoice_submissions", ["document_uuid"])

    for name, coltype in ORG_COLUMNS:
        op.add_column("organizations", sa.Column(name, coltype, nullable=True))


def downgrade() -> None:
    for name, _ in reversed(ORG_COLUMNS):
        op.drop_column("organizations", name)
    op.drop_index("ix_einvoice_submissions_document_uuid", table_name="einvoice_submissions")
    op.drop_index("ix_einvoice_submissions_submission_uid", table_name="einvoice_submissions")
    op.drop_index("ix_einvoice_org_status", table_name="einvoice_submissions")
    op.drop_index("ix_einvoice_org_source", table_name="einvoice_submissions")
    op.drop_table("einvoice_submissions")
