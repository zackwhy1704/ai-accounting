import csv
import io
import json
import logging
import re
from datetime import datetime, timezone, timedelta
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Query
from pydantic import BaseModel
from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import get_settings
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import (
    BankStatementLine, ReconciliationRule, Transaction, JournalEntry,
    Account, Contact, Invoice, Bill, BankAccount,
)

router = APIRouter(prefix="/bank-reconciliation", tags=["Bank Reconciliation"])
settings = get_settings()
logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────

def _detect_columns(headers: list[str]) -> dict[str, int | None]:
    """Map semantic column names to CSV column indices by inspecting headers."""
    lower = [h.strip().lower() for h in headers]
    mapping: dict[str, int | None] = {
        "date": None, "description": None, "reference": None,
        "debit": None, "credit": None, "amount": None, "balance": None,
    }
    for i, h in enumerate(lower):
        if "date" in h and mapping["date"] is None:
            mapping["date"] = i
        elif h in ("description", "narrative", "details", "particulars", "memo") and mapping["description"] is None:
            mapping["description"] = i
        elif h in ("ref", "reference", "check", "cheque", "check no", "cheque no") and mapping["reference"] is None:
            mapping["reference"] = i
        elif h in ("debit", "withdrawal", "withdrawals", "debit amount") and mapping["debit"] is None:
            mapping["debit"] = i
        elif h in ("credit", "deposit", "deposits", "credit amount") and mapping["credit"] is None:
            mapping["credit"] = i
        elif h in ("amount",) and mapping["amount"] is None:
            mapping["amount"] = i
        elif h in ("balance", "running balance", "closing balance") and mapping["balance"] is None:
            mapping["balance"] = i
    return mapping


def _parse_amount(val: str | None) -> float | None:
    if not val:
        return None
    val = val.strip().replace(",", "").replace("$", "").replace("£", "").replace("€", "")
    # Handle parentheses as negative: (123.45) -> -123.45
    if val.startswith("(") and val.endswith(")"):
        val = "-" + val[1:-1]
    try:
        return float(val)
    except ValueError:
        return None


def _parse_date(val: str) -> datetime | None:
    val = val.strip()
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%d %b %Y", "%d %B %Y", "%Y/%m/%d"):
        try:
            dt = datetime.strptime(val, fmt)
            return dt.replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    return None


def _line_to_dict(line: BankStatementLine) -> dict:
    return {
        "id": str(line.id),
        "organization_id": str(line.organization_id),
        "bank_account_id": str(line.bank_account_id) if line.bank_account_id else None,
        "date": line.date.isoformat() if line.date else None,
        "description": line.description,
        "reference": line.reference,
        "amount": float(line.amount) if line.amount is not None else None,
        "balance": float(line.balance) if line.balance is not None else None,
        "status": line.status,
        "matched_transaction_id": str(line.matched_transaction_id) if line.matched_transaction_id else None,
        "match_confidence": float(line.match_confidence) if line.match_confidence is not None else None,
        "match_reason": line.match_reason,
        "created_at": line.created_at.isoformat() if line.created_at else None,
    }


async def _ai_match(unmatched_lines: list[dict], candidate_transactions: list[dict]) -> list[dict]:
    """Use Claude to suggest matches between bank lines and book transactions."""
    if not settings.ANTHROPIC_API_KEY or not unmatched_lines or not candidate_transactions:
        return []

    import anthropic

    client = anthropic.AsyncAnthropic(api_key=settings.ANTHROPIC_API_KEY)

    prompt = f"""You are a bank reconciliation assistant. Match bank statement lines to accounting transactions.

Bank statement lines (unmatched):
{json.dumps([{"id": str(l["id"]), "date": l["date"], "description": l["description"], "amount": l["amount"], "reference": l["reference"]} for l in unmatched_lines], indent=2)}

Candidate book transactions:
{json.dumps([{"id": str(t["id"]), "date": t["date"], "description": t["description"], "amount": t["amount"], "reference": t["reference"]} for t in candidate_transactions], indent=2)}

For each bank line, find the best matching transaction. Consider:
- Amount match (exact or very close)
- Date proximity (within a few days)
- Description similarity (e.g., "AMZN MKTP" matches "Amazon Purchase")
- Reference number match

Return a JSON array of matches:
[{{"bank_line_id": "...", "transaction_id": "...", "confidence": 0.0-1.0, "reason": "brief explanation"}}]

Only include matches with confidence >= 0.5. If no good match exists, omit that bank line.
Return ONLY the JSON array, no other text."""

    try:
        response = await client.messages.create(
            model=settings.AI_MODEL,
            max_tokens=4096,
            messages=[{"role": "user", "content": prompt}],
        )

        text = response.content[0].text.strip()
        if text.startswith("["):
            return json.loads(text)
        match = re.search(r'\[.*\]', text, re.DOTALL)
        if match:
            return json.loads(match.group())
    except Exception as e:
        logger.error(f"AI matching failed: {e}")
    return []


# ── Endpoints ─────────────────────────────────

@router.post("/upload")
async def upload_bank_statement(
    file: UploadFile = File(...),
    bank_account_id: UUID = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Upload a CSV bank statement and create BankStatementLine records."""
    org_id = current_user["org_id"]

    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    content = await file.read()
    try:
        text = content.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = content.decode("latin-1")

    reader = csv.reader(io.StringIO(text))
    rows = list(reader)
    if len(rows) < 2:
        raise HTTPException(status_code=400, detail="CSV file is empty or has no data rows")

    col_map = _detect_columns(rows[0])
    if col_map["date"] is None or col_map["description"] is None:
        raise HTTPException(status_code=400, detail="Could not detect required columns (date, description)")
    if col_map["amount"] is None and col_map["debit"] is None and col_map["credit"] is None:
        raise HTTPException(status_code=400, detail="Could not detect amount columns (amount, debit, or credit)")

    count = 0
    for row in rows[1:]:
        if not row or all(c.strip() == "" for c in row):
            continue

        date = _parse_date(row[col_map["date"]]) if col_map["date"] is not None and col_map["date"] < len(row) else None
        if not date:
            continue

        desc = row[col_map["description"]].strip() if col_map["description"] is not None and col_map["description"] < len(row) else ""
        ref = row[col_map["reference"]].strip() if col_map["reference"] is not None and col_map["reference"] < len(row) else None

        # Determine amount
        if col_map["amount"] is not None and col_map["amount"] < len(row):
            amount = _parse_amount(row[col_map["amount"]])
        else:
            debit = _parse_amount(row[col_map["debit"]] if col_map["debit"] is not None and col_map["debit"] < len(row) else None) or 0
            credit = _parse_amount(row[col_map["credit"]] if col_map["credit"] is not None and col_map["credit"] < len(row) else None) or 0
            amount = credit - debit

        if amount is None:
            continue

        balance = _parse_amount(row[col_map["balance"]] if col_map["balance"] is not None and col_map["balance"] < len(row) else None)

        line = BankStatementLine(
            organization_id=org_id,
            bank_account_id=bank_account_id,
            date=date,
            description=desc,
            reference=ref if ref else None,
            amount=amount,
            balance=balance,
            status="unmatched",
        )
        db.add(line)
        count += 1

    await db.commit()
    return {"imported": count}


@router.get("/lines")
async def get_statement_lines(
    status: str = Query(None),
    bank_account_id: UUID = Query(None),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Return all statement lines for the org with optional filters."""
    org_id = current_user["org_id"]
    q = select(BankStatementLine).where(BankStatementLine.organization_id == org_id)

    if status:
        q = q.where(BankStatementLine.status == status)
    if bank_account_id:
        q = q.where(BankStatementLine.bank_account_id == bank_account_id)

    q = q.order_by(BankStatementLine.date.desc())
    result = await db.execute(q)
    lines = result.scalars().all()

    output = []
    for line in lines:
        d = _line_to_dict(line)
        # Attach matched transaction info if matched
        if line.matched_transaction_id:
            txn_result = await db.execute(
                select(Transaction).where(Transaction.id == line.matched_transaction_id)
            )
            txn = txn_result.scalar_one_or_none()
            if txn:
                d["matched_transaction"] = {
                    "id": str(txn.id),
                    "date": txn.date.isoformat(),
                    "description": txn.description,
                    "reference": txn.reference,
                }
        output.append(d)

    return output


@router.post("/auto-match")
async def auto_match(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Run AI-powered auto-matching on unmatched bank statement lines."""
    org_id = current_user["org_id"]

    # Load unmatched bank statement lines
    result = await db.execute(
        select(BankStatementLine)
        .where(BankStatementLine.organization_id == org_id)
        .where(BankStatementLine.status == "unmatched")
    )
    unmatched_lines = list(result.scalars().all())
    if not unmatched_lines:
        return {"auto_matched": 0, "ai_suggested": 0, "unmatched": 0, "lines": []}

    # Get already-matched transaction IDs to exclude them
    matched_txn_result = await db.execute(
        select(BankStatementLine.matched_transaction_id)
        .where(BankStatementLine.organization_id == org_id)
        .where(BankStatementLine.matched_transaction_id.isnot(None))
    )
    already_matched_ids = {row[0] for row in matched_txn_result.all()}

    # Load candidate transactions
    txn_q = select(Transaction).where(Transaction.organization_id == org_id)
    if already_matched_ids:
        txn_q = txn_q.where(Transaction.id.notin_(already_matched_ids))
    txn_result = await db.execute(txn_q)
    candidate_txns = list(txn_result.scalars().all())

    # Build transaction dicts with net amounts from journal entries
    txn_dicts: list[dict] = []
    for txn in candidate_txns:
        entries_result = await db.execute(
            select(JournalEntry).where(JournalEntry.transaction_id == txn.id)
        )
        entries = entries_result.scalars().all()
        # Net amount: total debits - total credits (bank perspective)
        net = sum(float(e.debit) - float(e.credit) for e in entries)
        txn_dicts.append({
            "id": str(txn.id),
            "date": txn.date.isoformat() if txn.date else None,
            "description": txn.description,
            "amount": net,
            "reference": txn.reference,
        })

    # Load reconciliation rules
    rules_result = await db.execute(
        select(ReconciliationRule).where(ReconciliationRule.organization_id == org_id)
    )
    rules = list(rules_result.scalars().all())

    auto_matched = 0
    ai_suggested = 0
    still_unmatched_lines: list[BankStatementLine] = []
    still_unmatched_dicts: list[dict] = []

    # Build a set to track used transaction IDs during matching
    used_txn_ids: set[str] = set()

    for line in unmatched_lines:
        matched = False
        line_amount = float(line.amount)

        # Pass 1: Rule-based matching
        for rule in rules:
            if rule.pattern.lower() in line.description.lower():
                # Find a transaction that matches amount within ±5 days
                for td in txn_dicts:
                    if td["id"] in used_txn_ids:
                        continue
                    if abs(td["amount"] - line_amount) < 0.01:
                        txn_date = datetime.fromisoformat(td["date"]) if td["date"] else None
                        if txn_date and abs((txn_date - line.date).days) <= 5:
                            line.matched_transaction_id = UUID(td["id"])
                            line.match_confidence = 0.90
                            line.match_reason = f"Rule match: pattern '{rule.pattern}'"
                            line.status = "matched"
                            rule.match_count += 1
                            used_txn_ids.add(td["id"])
                            auto_matched += 1
                            matched = True
                            break
                if matched:
                    break

        if matched:
            continue

        # Pass 2: Deterministic matching — exact amount + date within ±5 days
        for td in txn_dicts:
            if td["id"] in used_txn_ids:
                continue
            if abs(td["amount"] - line_amount) < 0.01:
                txn_date = datetime.fromisoformat(td["date"]) if td["date"] else None
                if txn_date and abs((txn_date - line.date).days) <= 5:
                    line.matched_transaction_id = UUID(td["id"])
                    line.match_confidence = 0.85
                    line.match_reason = "Exact amount match within ±5 days"
                    line.status = "matched"
                    used_txn_ids.add(td["id"])
                    auto_matched += 1
                    matched = True
                    break

        if not matched:
            still_unmatched_lines.append(line)
            still_unmatched_dicts.append({
                "id": str(line.id),
                "date": line.date.isoformat() if line.date else None,
                "description": line.description,
                "amount": line_amount,
                "reference": line.reference,
            })

    # Pass 3: AI matching for remaining unmatched
    remaining_txn_dicts = [td for td in txn_dicts if td["id"] not in used_txn_ids]
    if still_unmatched_dicts and remaining_txn_dicts:
        ai_matches = await _ai_match(still_unmatched_dicts, remaining_txn_dicts)
        ai_match_map = {m["bank_line_id"]: m for m in ai_matches}

        for line in still_unmatched_lines:
            m = ai_match_map.get(str(line.id))
            if m and m["transaction_id"] not in used_txn_ids:
                line.matched_transaction_id = UUID(m["transaction_id"])
                line.match_confidence = float(m.get("confidence", 0.5))
                line.match_reason = f"AI: {m.get('reason', 'AI-suggested match')}"
                line.status = "matched"
                used_txn_ids.add(m["transaction_id"])
                ai_suggested += 1

    await db.commit()

    # Reload all lines for response
    result = await db.execute(
        select(BankStatementLine)
        .where(BankStatementLine.organization_id == org_id)
        .order_by(BankStatementLine.date.desc())
    )
    all_lines = result.scalars().all()

    remaining_unmatched = sum(1 for l in all_lines if l.status == "unmatched")
    return {
        "auto_matched": auto_matched,
        "ai_suggested": ai_suggested,
        "unmatched": remaining_unmatched,
        "lines": [_line_to_dict(l) for l in all_lines],
    }


@router.post("/confirm/{line_id}")
async def confirm_match(
    line_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Confirm a match — set status to reconciled and learn a new rule."""
    org_id = current_user["org_id"]

    result = await db.execute(
        select(BankStatementLine)
        .where(BankStatementLine.id == line_id)
        .where(BankStatementLine.organization_id == org_id)
    )
    line = result.scalar_one_or_none()
    if not line:
        raise HTTPException(status_code=404, detail="Statement line not found")
    if not line.matched_transaction_id:
        raise HTTPException(status_code=400, detail="Line has no match to confirm")

    line.status = "reconciled"

    # Learn: create a reconciliation rule from the description if it doesn't exist
    pattern = line.description.strip()
    if pattern:
        existing_rule = await db.execute(
            select(ReconciliationRule)
            .where(ReconciliationRule.organization_id == org_id)
            .where(ReconciliationRule.pattern == pattern)
        )
        if not existing_rule.scalar_one_or_none():
            rule = ReconciliationRule(
                organization_id=org_id,
                pattern=pattern,
            )
            db.add(rule)

    await db.commit()
    await db.refresh(line)
    return _line_to_dict(line)


@router.post("/unmatch/{line_id}")
async def unmatch_line(
    line_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Reject a match — clear the matched transaction and set status to unmatched."""
    org_id = current_user["org_id"]

    result = await db.execute(
        select(BankStatementLine)
        .where(BankStatementLine.id == line_id)
        .where(BankStatementLine.organization_id == org_id)
    )
    line = result.scalar_one_or_none()
    if not line:
        raise HTTPException(status_code=404, detail="Statement line not found")

    line.matched_transaction_id = None
    line.match_confidence = None
    line.match_reason = None
    line.status = "unmatched"

    await db.commit()
    await db.refresh(line)
    return _line_to_dict(line)


class ManualMatchRequest(BaseModel):
    transaction_id: UUID


@router.post("/manual-match/{line_id}")
async def manual_match(
    line_id: UUID,
    body: ManualMatchRequest,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Manually match a bank statement line to a transaction."""
    org_id = current_user["org_id"]

    result = await db.execute(
        select(BankStatementLine)
        .where(BankStatementLine.id == line_id)
        .where(BankStatementLine.organization_id == org_id)
    )
    line = result.scalar_one_or_none()
    if not line:
        raise HTTPException(status_code=404, detail="Statement line not found")

    # Verify transaction exists and belongs to same org
    txn_result = await db.execute(
        select(Transaction)
        .where(Transaction.id == body.transaction_id)
        .where(Transaction.organization_id == org_id)
    )
    txn = txn_result.scalar_one_or_none()
    if not txn:
        raise HTTPException(status_code=404, detail="Transaction not found")

    line.matched_transaction_id = body.transaction_id
    line.match_confidence = 1.0
    line.match_reason = "Manual match"
    line.status = "matched"

    await db.commit()
    await db.refresh(line)
    return _line_to_dict(line)


@router.get("/summary")
async def reconciliation_summary(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Return reconciliation summary stats."""
    org_id = current_user["org_id"]

    result = await db.execute(
        select(
            func.count(BankStatementLine.id).label("total"),
            func.count(BankStatementLine.id).filter(BankStatementLine.status == "matched").label("matched"),
            func.count(BankStatementLine.id).filter(BankStatementLine.status == "reconciled").label("reconciled"),
            func.count(BankStatementLine.id).filter(BankStatementLine.status == "unmatched").label("unmatched"),
            func.sum(BankStatementLine.amount).label("bank_total"),
        )
        .where(BankStatementLine.organization_id == org_id)
    )
    row = result.one()

    # Book balance: sum of all posted transaction journal entries (net)
    book_result = await db.execute(
        select(
            func.sum(JournalEntry.debit) - func.sum(JournalEntry.credit)
        )
        .join(Transaction, JournalEntry.transaction_id == Transaction.id)
        .where(Transaction.organization_id == org_id)
        .where(Transaction.is_posted == True)
    )
    book_balance = book_result.scalar() or 0

    return {
        "total_lines": row.total or 0,
        "matched": row.matched or 0,
        "reconciled": row.reconciled or 0,
        "unmatched": row.unmatched or 0,
        "bank_balance": float(row.bank_total) if row.bank_total else 0,
        "book_balance": float(book_balance),
        "difference": float((row.bank_total or 0) - book_balance),
    }
