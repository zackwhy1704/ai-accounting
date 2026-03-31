from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import ManualJournal, ManualJournalLine, Transaction, JournalEntry
from app.schemas.schemas import ManualJournalCreate, ManualJournalResponse
from .gl_helpers import revert_gl

router = APIRouter(prefix="/manual-journals", tags=["manual-journals"])


async def _next_journal_number(org_id: UUID, db: AsyncSession) -> str:
    result = await db.execute(
        select(func.count(ManualJournal.id)).where(ManualJournal.organization_id == org_id)
    )
    count = result.scalar_one() + 1
    return f"JE-{count:05d}"


@router.get("", response_model=list[ManualJournalResponse])
async def list_journals(
    status: str | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    q = (
        select(ManualJournal)
        .options(selectinload(ManualJournal.lines))
        .where(ManualJournal.organization_id == current_user["org_id"])
    )
    if status:
        q = q.where(ManualJournal.status == status)
    q = q.order_by(ManualJournal.date.desc())
    result = await db.execute(q)
    return result.scalars().all()


@router.post("", response_model=ManualJournalResponse, status_code=201)
async def create_journal(
    payload: ManualJournalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    if not payload.lines or len(payload.lines) < 2:
        raise HTTPException(status_code=422, detail="Journal must have at least 2 lines")

    total_debit = sum(l.debit for l in payload.lines)
    total_credit = sum(l.credit for l in payload.lines)
    if abs(total_debit - total_credit) > 0.01:
        raise HTTPException(status_code=422, detail="Debits must equal credits")

    journal_number = payload.journal_number or await _next_journal_number(
        current_user["org_id"], db
    )
    journal = ManualJournal(
        organization_id=current_user["org_id"],
        journal_number=journal_number,
        date=payload.date,
        reference=payload.reference,
        description=payload.description,
        currency=payload.currency,
        created_by=current_user["sub"],
    )
    db.add(journal)
    await db.flush()

    for line_data in payload.lines:
        line = ManualJournalLine(journal_id=journal.id, **line_data.model_dump())
        db.add(line)

    await db.commit()
    await db.refresh(journal)
    result = await db.execute(
        select(ManualJournal)
        .options(selectinload(ManualJournal.lines))
        .where(ManualJournal.id == journal.id)
    )
    return result.scalar_one()


@router.get("/{journal_id}", response_model=ManualJournalResponse)
async def get_journal(
    journal_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(ManualJournal)
        .options(selectinload(ManualJournal.lines))
        .where(
            ManualJournal.id == journal_id,
            ManualJournal.organization_id == current_user["org_id"],
        )
    )
    journal = result.scalar_one_or_none()
    if not journal:
        raise HTTPException(status_code=404, detail="Journal not found")
    return journal


@router.post("/{journal_id}/post", response_model=ManualJournalResponse)
async def post_journal(
    journal_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(ManualJournal)
        .options(selectinload(ManualJournal.lines))
        .where(
            ManualJournal.id == journal_id,
            ManualJournal.organization_id == current_user["org_id"],
        )
    )
    journal = result.scalar_one_or_none()
    if not journal:
        raise HTTPException(status_code=404, detail="Journal not found")
    if journal.status != "draft":
        raise HTTPException(status_code=409, detail="Journal is already posted or void")
    journal.status = "posted"

    # Post to GL ledger
    txn = Transaction(
        organization_id=current_user["org_id"],
        date=journal.date,
        description=journal.description or journal.journal_number,
        reference=journal.reference or journal.journal_number,
        source="manual_journal",
        source_id=journal.id,
    )
    db.add(txn)
    await db.flush()
    for line in journal.lines:
        db.add(JournalEntry(
            transaction_id=txn.id,
            account_id=line.account_id,
            debit=round(float(line.debit), 2),
            credit=round(float(line.credit), 2),
        ))

    await db.commit()
    await db.refresh(journal)
    return journal


@router.post("/{journal_id}/void", response_model=ManualJournalResponse)
async def void_journal(
    journal_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(ManualJournal)
        .options(selectinload(ManualJournal.lines))
        .where(
            ManualJournal.id == journal_id,
            ManualJournal.organization_id == current_user["org_id"],
        )
    )
    journal = result.scalar_one_or_none()
    if not journal:
        raise HTTPException(status_code=404, detail="Journal not found")
    if journal.status == "void":
        raise HTTPException(status_code=409, detail="Journal already voided")
    prev_status = journal.status
    journal.status = "void"

    # Reverse GL if it was posted
    if prev_status == "posted":
        await revert_gl(
            db, current_user["org_id"], journal_id, "manual_journal",
            journal.date,
            f"Reversal: Journal {journal.journal_number} voided",
            journal.reference or journal.journal_number,
        )

    await db.commit()
    await db.refresh(journal)
    return journal
