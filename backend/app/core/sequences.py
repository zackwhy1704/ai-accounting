"""Canonical document-number generation.

One sequential generator for every document type, replacing the per-module
mix of `next_sequence_number` (sales.py) and `random.randint` (stock.py).

`next_sequence_number` parses the trailing integer of existing rows so deleted
rows don't cause reuse, falling back to 1 when no parseable rows exist.
"""
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession


async def next_sequence_number(
    db: AsyncSession, model, number_column, org_id: str, prefix: str, width: int = 4
) -> str:
    """Return the next monotonic identifier (e.g. INV-0042) for an org+prefix."""
    rows = await db.execute(
        select(number_column).where(
            model.organization_id == org_id,
            number_column.like(f"{prefix}-%"),
        )
    )
    max_num = 0
    for (num,) in rows.all():
        try:
            n = int(str(num).split("-")[-1])
            if n > max_num:
                max_num = n
        except (ValueError, IndexError):
            continue
    return f"{prefix}-{max_num + 1:0{width}d}"
