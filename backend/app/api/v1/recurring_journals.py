"""
Recurring journals — schedule templates that materialize ManualJournals.

Mirrors the recurring-invoice pattern: active templates advance next_run_date
on each run; POST /run-due sweeps everything due (called by Celery beat or
manually). Materialized journals are posted to the GL immediately when
auto_post is set — unless the date falls in a locked period, in which case the
journal is left as a draft for review instead of failing the whole sweep.
"""
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, field_validator
from sqlalchemy import select, func, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit
from app.core.database import get_db
from app.core.pagination import PaginationParams, paginated_result, apply_sort
from app.core.permissions import require_write
from app.core.security import get_current_user
from app.core.sequences import next_sequence_number
from app.models.models import JournalEntry, ManualJournal, ManualJournalLine, RecurringJournal, Transaction
from .recurring_invoices import _calc_next_run

router = APIRouter(prefix="/recurring-journals", tags=["recurring-journals"])

_FREQUENCIES = {"daily", "weekly", "monthly", "yearly"}


def validate_journal_lines(lines: list[dict]) -> None:
    """>= 2 lines, every line has an account, debits equal credits."""
    if not lines or len(lines) < 2:
        raise HTTPException(status_code=422, detail="A journal template needs at least 2 lines")
    if any(not l.get("account_id") for l in lines):
        raise HTTPException(status_code=422, detail="Every line needs an account_id")
    dr = round(sum(float(l.get("debit") or 0) for l in lines), 2)
    cr = round(sum(float(l.get("credit") or 0) for l in lines), 2)
    if dr != cr:
        raise HTTPException(status_code=422, detail=f"Journal must balance: debits {dr} != credits {cr}")


class RecurringJournalCreate(BaseModel):
    name: str
    frequency: str
    frequency_interval: int = 1
    start_date: datetime
    end_date: datetime | None = None
    max_runs: int | None = None
    reference: str | None = None
    description: str | None = None
    auto_post: bool = True
    lines: list[dict]

    @field_validator("frequency")
    @classmethod
    def _freq(cls, v):
        if v not in _FREQUENCIES:
            raise ValueError(f"frequency must be one of {sorted(_FREQUENCIES)}")
        return v


class RecurringJournalUpdate(BaseModel):
    name: str | None = None
    frequency: str | None = None
    frequency_interval: int | None = None
    start_date: datetime | None = None
    end_date: datetime | None = None
    max_runs: int | None = None
    reference: str | None = None
    description: str | None = None
    auto_post: bool | None = None
    lines: list[dict] | None = None
    status: str | None = None


@router.get("")
async def list_recurring_journals(
    status: str | None = None,
    p: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    base = select(RecurringJournal).where(RecurringJournal.organization_id == org_id)
    if status:
        base = base.where(RecurringJournal.status == status)
    if p.search:
        like = f"%{p.search}%"
        base = base.where(or_(RecurringJournal.name.ilike(like), RecurringJournal.reference.ilike(like)))
    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    rows = (await db.execute(
        apply_sort(base, RecurringJournal, p, "next_run_date").offset(p.offset).limit(p.limit)
    )).scalars().all()
    items = [_to_dict(r) for r in rows]
    return paginated_result(items, total, p)


def _to_dict(r: RecurringJournal) -> dict:
    return {
        "id": str(r.id), "name": r.name, "status": r.status,
        "frequency": r.frequency, "frequency_interval": r.frequency_interval,
        "start_date": r.start_date.isoformat() if r.start_date else None,
        "end_date": r.end_date.isoformat() if r.end_date else None,
        "next_run_date": r.next_run_date.isoformat() if r.next_run_date else None,
        "last_run_date": r.last_run_date.isoformat() if r.last_run_date else None,
        "run_count": r.run_count, "max_runs": r.max_runs,
        "reference": r.reference, "description": r.description,
        "auto_post": r.auto_post, "lines": r.lines,
    }


@router.post("", status_code=201)
async def create_recurring_journal(
    payload: RecurringJournalCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    validate_journal_lines(payload.lines)
    rj = RecurringJournal(
        organization_id=current_user["org_id"],
        name=payload.name, frequency=payload.frequency,
        frequency_interval=payload.frequency_interval,
        start_date=payload.start_date, end_date=payload.end_date,
        next_run_date=payload.start_date, max_runs=payload.max_runs,
        reference=payload.reference, description=payload.description,
        auto_post=payload.auto_post, lines=payload.lines,
    )
    db.add(rj)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "create", "recurring_journal", rj.id)
    return _to_dict(rj)


@router.get("/{rj_id}")
async def get_recurring_journal(rj_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    rj = await _load(db, rj_id, current_user["org_id"])
    return _to_dict(rj)


async def _load(db: AsyncSession, rj_id: UUID, org_id) -> RecurringJournal:
    rj = (await db.execute(
        select(RecurringJournal).where(RecurringJournal.id == rj_id, RecurringJournal.organization_id == org_id)
    )).scalar_one_or_none()
    if not rj:
        raise HTTPException(status_code=404, detail="Recurring journal not found")
    return rj


@router.patch("/{rj_id}")
async def update_recurring_journal(
    rj_id: UUID,
    payload: RecurringJournalUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    rj = await _load(db, rj_id, current_user["org_id"])
    data = payload.model_dump(exclude_unset=True)
    if "lines" in data:
        validate_journal_lines(data["lines"])
    if "status" in data and data["status"] not in ("active", "paused", "completed", "cancelled"):
        raise HTTPException(status_code=400, detail="Invalid status")
    if "frequency" in data and data["frequency"] not in _FREQUENCIES:
        raise HTTPException(status_code=400, detail=f"frequency must be one of {sorted(_FREQUENCIES)}")
    for k, v in data.items():
        setattr(rj, k, v)
    if {"start_date", "frequency", "frequency_interval"} & data.keys():
        rj.next_run_date = _calc_next_run(rj.start_date, rj.frequency, rj.frequency_interval)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "update", "recurring_journal", rj_id)
    return _to_dict(rj)


@router.delete("/{rj_id}", status_code=204)
async def delete_recurring_journal(rj_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    rj = await _load(db, rj_id, current_user["org_id"])
    await db.delete(rj)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "delete", "recurring_journal", rj_id)


async def _materialize(db: AsyncSession, rj: RecurringJournal, run_date: datetime) -> tuple[ManualJournal, bool]:
    """Create a ManualJournal from the template; post GL when auto_post and the
    period is open. Returns (journal, posted)."""
    number = await next_sequence_number(db, ManualJournal, ManualJournal.journal_number, rj.organization_id, "MJ")
    journal = ManualJournal(
        organization_id=rj.organization_id, journal_number=number, date=run_date,
        reference=rj.reference, description=rj.description or rj.name, status="draft",
    )
    db.add(journal)
    await db.flush()
    for l in rj.lines:
        db.add(ManualJournalLine(
            journal_id=journal.id, account_id=UUID(str(l["account_id"])),
            description=l.get("description"),
            debit=round(float(l.get("debit") or 0), 2), credit=round(float(l.get("credit") or 0), 2),
        ))

    posted = False
    if rj.auto_post:
        from app.api.v1.gl_helpers import _assert_period_open
        try:
            await _assert_period_open(db, rj.organization_id, run_date)
        except HTTPException:
            return journal, False  # locked period → leave as draft for review
        journal.status = "posted"
        txn = Transaction(
            organization_id=rj.organization_id, date=run_date,
            description=journal.description or number, reference=rj.reference or number,
            source="manual_journal", source_id=journal.id,
        )
        db.add(txn)
        await db.flush()
        for l in rj.lines:
            db.add(JournalEntry(
                transaction_id=txn.id, account_id=UUID(str(l["account_id"])),
                debit=round(float(l.get("debit") or 0), 2), credit=round(float(l.get("credit") or 0), 2),
            ))
        posted = True

    rj.run_count = int(rj.run_count or 0) + 1
    rj.last_run_date = run_date
    rj.next_run_date = _calc_next_run(rj.start_date, rj.frequency, rj.frequency_interval, rj.next_run_date)
    if (rj.max_runs and rj.run_count >= rj.max_runs) or (rj.end_date and rj.next_run_date > rj.end_date):
        rj.status = "completed"
    return journal, posted


@router.post("/{rj_id}/run-now")
async def run_now(rj_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    rj = await _load(db, rj_id, current_user["org_id"])
    if rj.status != "active":
        raise HTTPException(status_code=400, detail=f"Template is {rj.status}")
    journal, posted = await _materialize(db, rj, datetime.now(timezone.utc))
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "run", "recurring_journal", rj_id)
    return {"journal_id": str(journal.id), "journal_number": journal.journal_number,
            "posted": posted, "next_run_date": rj.next_run_date.isoformat()}


@router.post("/run-due")
async def run_due(db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    """Materialize every active template past its next_run_date (max 24 catch-ups each)."""
    org_id = current_user["org_id"]
    now = datetime.now(timezone.utc)
    due = (await db.execute(
        select(RecurringJournal).where(
            RecurringJournal.organization_id == org_id,
            RecurringJournal.status == "active",
            RecurringJournal.next_run_date <= now,
        )
    )).scalars().all()
    results = []
    for rj in due:
        runs = 0
        while rj.status == "active" and rj.next_run_date <= now and runs < 24:
            run_date = rj.next_run_date
            journal, posted = await _materialize(db, rj, run_date)
            results.append({"template": rj.name, "journal_number": journal.journal_number,
                            "date": run_date.isoformat(), "posted": posted})
            runs += 1
    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "run_due", "recurring_journal", None,
                    {"generated": len(results)})
    return {"generated": len(results), "results": results}
