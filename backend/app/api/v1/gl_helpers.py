"""
Shared double-entry GL helper used by all transaction modules.

post_gl(db, org_id, date, description, reference, source, source_id, entries)
  entries = list of (account_code, debit, credit)

revert_gl(db, org_id, source_id, source, date, description, reference)
  Creates a reversal transaction that swaps debit<->credit on all original entries.

_acct(db, org_id, code) — fetch account by code, returns None if missing.
"""

from datetime import datetime
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.models import Account, Transaction, JournalEntry


async def _acct(db: AsyncSession, org_id: str, code: str) -> Account | None:
    result = await db.execute(
        select(Account).where(Account.organization_id == org_id, Account.code == code)
    )
    return result.scalar_one_or_none()


async def post_gl(
    db: AsyncSession,
    org_id: str,
    date: datetime,
    description: str,
    reference: str,
    source: str,
    source_id: UUID,
    entries: list[tuple[str, float, float]],  # (account_code, debit, credit)
) -> Transaction | None:
    """
    Create a balanced Transaction + JournalEntry rows.
    Skips silently if any required account is missing.
    Returns the Transaction or None.
    """
    # Resolve all accounts first — abort if any missing
    resolved: list[tuple[Account, float, float]] = []
    for code, debit, credit in entries:
        if debit == 0 and credit == 0:
            continue
        acct = await _acct(db, org_id, code)
        if acct is None:
            return None  # Missing COA entry — skip entire transaction
        resolved.append((acct, debit, credit))

    if not resolved:
        return None
    return await _write_txn(db, org_id, date, description, reference, source, source_id, resolved)


async def post_gl_by_id(
    db: AsyncSession,
    org_id: str,
    date: datetime,
    description: str,
    reference: str,
    source: str,
    source_id: UUID,
    entries: list[tuple[UUID, float, float]],  # (account_id, debit, credit)
) -> Transaction | None:
    """Same as post_gl, but takes account UUIDs directly. For modules that
    already store account_id (bank transfers, fixed-asset accounts wired by
    the user via Settings) and don't need to resolve by COA code."""
    resolved: list[tuple[Account, float, float]] = []
    for acct_id, debit, credit in entries:
        if debit == 0 and credit == 0:
            continue
        result = await db.execute(
            select(Account).where(Account.id == acct_id, Account.organization_id == org_id)
        )
        acct = result.scalar_one_or_none()
        if acct is None:
            return None
        resolved.append((acct, debit, credit))
    if not resolved:
        return None
    return await _write_txn(db, org_id, date, description, reference, source, source_id, resolved)


async def _write_txn(
    db: AsyncSession,
    org_id: str,
    date: datetime,
    description: str,
    reference: str,
    source: str,
    source_id: UUID,
    resolved: list[tuple[Account, float, float]],
) -> Transaction:

    txn = Transaction(
        organization_id=org_id,
        date=date,
        description=description,
        reference=reference,
        source=source,
        source_id=source_id,
    )
    db.add(txn)
    await db.flush()

    for acct, debit, credit in resolved:
        db.add(JournalEntry(
            transaction_id=txn.id,
            account_id=acct.id,
            debit=round(debit, 2),
            credit=round(credit, 2),
        ))

    return txn


async def revert_gl(
    db: AsyncSession,
    org_id: str,
    source_id: UUID,
    source: str,
    date: datetime,
    description: str,
    reference: str,
) -> Transaction | None:
    """
    Find all JournalEntries for the given source_id+source,
    swap debit<->credit, and post them as a new reversal Transaction.
    """
    # Find original transactions for this source document
    result = await db.execute(
        select(Transaction).where(
            Transaction.organization_id == org_id,
            Transaction.source_id == source_id,
            Transaction.source == source,
        )
    )
    original_txns = result.scalars().all()
    if not original_txns:
        return None

    # Collect all entries across all original transactions
    reversal_entries: list[tuple[Account, float, float]] = []
    for orig in original_txns:
        entries_result = await db.execute(
            select(JournalEntry).where(JournalEntry.transaction_id == orig.id)
        )
        for entry in entries_result.scalars().all():
            reversal_entries.append((entry.account_id, float(entry.credit), float(entry.debit)))

    if not reversal_entries:
        return None

    rev_txn = Transaction(
        organization_id=org_id,
        date=date,
        description=description,
        reference=reference,
        source=f"{source}_reversal",
        source_id=source_id,
    )
    db.add(rev_txn)
    await db.flush()

    for account_id, debit, credit in reversal_entries:
        db.add(JournalEntry(
            transaction_id=rev_txn.id,
            account_id=account_id,
            debit=round(debit, 2),
            credit=round(credit, 2),
        ))

    return rev_txn
