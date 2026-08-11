"""
Shared double-entry GL helper used by all transaction modules.

post_gl(db, org_id, date, description, reference, source, source_id, entries)
  entries = list of (account_code, debit, credit)

revert_gl(db, org_id, source_id, source, date, description, reference)
  Creates a reversal transaction that swaps debit<->credit on all original entries.

_acct(db, org_id, code) — fetch account by code, returns None if missing.
"""

import logging
from datetime import datetime
from uuid import UUID
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.models import Account, Transaction, JournalEntry

logger = logging.getLogger(__name__)


def _assert_balanced(resolved: list[tuple]) -> None:
    """Guard: refuse to write a transaction whose debits != credits.

    A double-entry transaction must balance. Without this, a caller passing
    mismatched entries would write a corrupt, unbalanced ledger silently.
    """
    total_debit = round(sum(d for _, d, _ in resolved), 2)
    total_credit = round(sum(c for _, _, c in resolved), 2)
    if abs(total_debit - total_credit) > 0.01:
        raise HTTPException(
            status_code=400,
            detail=f"Journal entries do not balance: debit={total_debit}, credit={total_credit}",
        )


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
    project_id: UUID | None = None,
    department_id: UUID | None = None,
) -> Transaction | None:
    """
    Create a balanced Transaction + JournalEntry rows.
    Skips silently if any required account is missing.
    Returns the Transaction or None.
    """
    # Resolve all accounts first — abort if any missing or non-postable
    resolved: list[tuple[Account, float, float]] = []
    for code, debit, credit in entries:
        if debit == 0 and credit == 0:
            continue
        acct = await _acct(db, org_id, code)
        if acct is None:
            # Missing COA entry — the document is NOT posted to the ledger.
            # Loudly warn: the subledger and GL will diverge silently otherwise.
            logger.warning(
                "GL posting skipped: account code %r not found for org %s "
                "(source=%s ref=%s). Document is NOT in the ledger — configure "
                "default accounts or add this code to the chart.",
                code, org_id, source, reference,
            )
            return None
        if hasattr(acct, 'account_role') and acct.account_role in ("header", "subheader"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot post journal entries to header/subheader account '{acct.name}' ({acct.code})"
            )
        resolved.append((acct, debit, credit))

    if not resolved:
        return None
    return await _write_txn(db, org_id, date, description, reference, source, source_id, resolved,
                            project_id=project_id, department_id=department_id)


async def post_gl_by_id(
    db: AsyncSession,
    org_id: str,
    date: datetime,
    description: str,
    reference: str,
    source: str,
    source_id: UUID,
    entries: list[tuple[UUID, float, float]],  # (account_id, debit, credit)
    project_id: UUID | None = None,
    department_id: UUID | None = None,
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
            logger.warning(
                "GL posting skipped: account id %s not found for org %s "
                "(source=%s ref=%s). Document is NOT in the ledger.",
                acct_id, org_id, source, reference,
            )
            return None
        if hasattr(acct, 'account_role') and acct.account_role in ("header", "subheader"):
            raise HTTPException(
                status_code=400,
                detail=f"Cannot post journal entries to header/subheader account '{acct.name}' ({acct.code})"
            )
        resolved.append((acct, debit, credit))
    if not resolved:
        return None
    return await _write_txn(db, org_id, date, description, reference, source, source_id, resolved,
                            project_id=project_id, department_id=department_id)


async def _assert_period_open(db: AsyncSession, org_id: str, date: datetime) -> None:
    """Refuse to post a transaction dated on/before the org's locked_through_date.

    Central guard: every GL write flows through _write_txn, so locking here covers
    all financial mutations (invoices, bills, payments, CN/DN, receipts, refunds,
    manual journals, adjustments) without touching each router.
    """
    from app.models.auth import Organization
    org = (await db.execute(
        select(Organization).where(Organization.id == org_id)
    )).scalar_one_or_none()
    locked = getattr(org, "locked_through_date", None) if org else None
    if locked and date is not None:
        d = date.date() if hasattr(date, "date") else date
        ld = locked.date() if hasattr(locked, "date") else locked
        if d <= ld:
            raise HTTPException(
                status_code=400,
                detail=f"Accounting period is locked through {ld.isoformat()}. "
                       f"Cannot post a transaction dated {d.isoformat()} to a closed period.",
            )


async def _write_txn(
    db: AsyncSession,
    org_id: str,
    date: datetime,
    description: str,
    reference: str,
    source: str,
    source_id: UUID,
    resolved: list[tuple[Account, float, float]],
    project_id: UUID | None = None,
    department_id: UUID | None = None,
) -> Transaction:

    await _assert_period_open(db, org_id, date)
    _assert_balanced(resolved)
    txn = Transaction(
        organization_id=org_id,
        date=date,
        description=description,
        reference=reference,
        source=source,
        source_id=source_id,
        project_id=project_id,
        department_id=department_id,
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

    # Period lock also covers reversals: voiding/cancelling a document posts a
    # reversal Transaction dated `date`. If that date is in a closed period, block
    # it (otherwise the lock could be bypassed by voiding).
    await _assert_period_open(db, org_id, date)

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
