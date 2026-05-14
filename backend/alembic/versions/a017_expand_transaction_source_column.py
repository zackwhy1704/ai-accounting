"""expand transactions.source to varchar(50)

Revision ID: a017
Revises: a016
Create Date: 2026-05-14
"""
from alembic import op
import sqlalchemy as sa

revision = "a017"
down_revision = "a016"
branch_labels = None
depends_on = None


def upgrade():
    op.alter_column(
        "transactions",
        "source",
        existing_type=sa.String(20),
        type_=sa.String(50),
        existing_nullable=False,
    )


def downgrade():
    op.alter_column(
        "transactions",
        "source",
        existing_type=sa.String(50),
        type_=sa.String(20),
        existing_nullable=False,
    )
