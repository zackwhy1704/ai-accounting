"""Project/department dimensions: master tables + FK columns on the GL and
the main posting documents (invoice, bill, manual journal lines).

Transaction carries the document-level dimension; JournalEntry can override
per line (manual journals). Reports resolve coalesce(entry, transaction).

Revision ID: a039
Revises: a038
"""
import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import UUID

revision = "a039"
down_revision = "a038"
branch_labels = None
depends_on = None

DIM_TABLES = ["projects", "departments"]
FK_TARGETS = [
    ("transactions", True),
    ("journal_entries", False),
    ("invoices", True),
    ("bills", True),
    ("manual_journal_lines", False),
]


def _dim_table(name: str) -> None:
    op.create_table(
        name,
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("organization_id", UUID(as_uuid=True), sa.ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False),
        sa.Column("code", sa.String(30), nullable=True),
        sa.Column("name", sa.String(200), nullable=False),
        sa.Column("description", sa.String(500), nullable=True),
        sa.Column("is_active", sa.Boolean(), nullable=False, server_default="true"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.text("now()")),
        sa.UniqueConstraint("organization_id", "name", name=f"uq_org_{name[:-1]}"),
    )
    op.create_index(f"ix_{name}_org", name, ["organization_id"])


def upgrade() -> None:
    for t in DIM_TABLES:
        _dim_table(t)
    for table, index in FK_TARGETS:
        op.add_column(table, sa.Column("project_id", UUID(as_uuid=True), sa.ForeignKey("projects.id"), nullable=True))
        op.add_column(table, sa.Column("department_id", UUID(as_uuid=True), sa.ForeignKey("departments.id"), nullable=True))
        if index:
            op.create_index(f"ix_{table}_project", table, ["project_id"])
            op.create_index(f"ix_{table}_department", table, ["department_id"])


def downgrade() -> None:
    for table, index in reversed(FK_TARGETS):
        if index:
            op.drop_index(f"ix_{table}_department", table_name=table)
            op.drop_index(f"ix_{table}_project", table_name=table)
        op.drop_column(table, "department_id")
        op.drop_column(table, "project_id")
    for t in reversed(DIM_TABLES):
        op.drop_index(f"ix_{t}_org", table_name=t)
        op.drop_table(t)
