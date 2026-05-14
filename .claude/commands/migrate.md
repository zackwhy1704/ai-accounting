---
description: Add a DB migration, update model + schema, apply cleanly
---

You are the **Migration Agent**. Your job is schema changes only — model, migration file, Pydantic schema. Do not touch API endpoints or frontend.

## Step 1 — Find current head

```bash
cd backend && python -m alembic heads
```

Note the current revision (e.g., `a014`). Your new revision is the next in sequence.

## Step 2 — Create migration file

File: `backend/alembic/versions/a0NN_<description>.py`

```python
"""<description>

Revision ID: a0NN
Revises: a0(NN-1)
Create Date: <today>
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "a0NN"
down_revision = "a0(NN-1)"
branch_labels = None
depends_on = None


def upgrade():
    # ADD COLUMN
    op.add_column("table_name", sa.Column("col_name", sa.String(255), nullable=True))

    # ALTER COLUMN (nullable change)
    op.alter_column("table_name", "col_name",
        existing_type=sa.String(255), nullable=True)

    # NEW TABLE
    op.create_table("table_name",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True, server_default=sa.text("gen_random_uuid()")),
        sa.Column("organization_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("organizations.id"), nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now()),
    )


def downgrade():
    # Reverse the upgrade
    op.drop_column("table_name", "col_name")
```

## Step 3 — Update SQLAlchemy model

File: `backend/app/models/models.py`

Rules:
- New nullable column: `col: Mapped[str | None] = mapped_column(String(255), nullable=True)`
- Money: `Mapped[Decimal] = mapped_column(Numeric(15, 2), default=0)`
- UUID FK: `Mapped[UUID | None] = mapped_column(ForeignKey("table.id"), nullable=True)`
- Always add to the correct class in dependency order

## Step 4 — Update Pydantic schemas

File: `backend/app/schemas/schemas.py`

- Add field to both `XxxCreate` and `XxxResponse`
- For optional fields use `field_name: str | None = None`
- For numeric fields use `field_name: float` (Pydantic coerces Decimal → float)

## Step 5 — Apply and verify

```bash
cd backend

# Apply migration
python -m alembic upgrade head

# Confirm column exists in DB
python3 -c "
import asyncio
from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy import text
async def q():
    engine = create_async_engine('postgresql+asyncpg://postgres:postgres@localhost:5433/ai_account')
    async with AsyncSession(engine) as db:
        r = await db.execute(text(\"\"\"
            SELECT column_name, is_nullable, data_type
            FROM information_schema.columns
            WHERE table_name = 'YOUR_TABLE'
            AND column_name = 'YOUR_COLUMN'
        \"\"\"))
        [print(row) for row in r.fetchall()]
asyncio.run(q())
"

# Backend import check
python -c "from app.main import app; print('OK')"
```

## Step 6 — Commit

```bash
git add backend/alembic/versions/a0NN_*.py backend/app/models/models.py backend/app/schemas/schemas.py
git commit -m "db: add <column/table> to <table>"
git push
```
