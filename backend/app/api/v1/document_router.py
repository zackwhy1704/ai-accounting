"""
document_router.py
==================
Routes a confirmed document → correct accounting module record + GL posting.

Called by POST /documents/{id}/create-journal after the user has reviewed
and optionally edited the AI-suggested journal lines.

Each handler returns:
    (record_id: UUID, record_number: str, gl_source: str, module_url: str)

GL is posted INSIDE each handler using the user-supplied journal_lines so the
Transaction.source + Transaction.source_id always point to the real module
record — never to the document itself.
"""

import random
from datetime import datetime, timezone, timedelta
from uuid import UUID

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.models.models import (
    Contact, Invoice, InvoiceLineItem,
    Bill, BillLineItem,
    CreditNote, CreditNoteLineItem,
    GoodsReceivedNote, GRNLineItem,
    VendorCredit,
    PurchasePayment, PurchaseRefund,
    SaleReceipt,
    StockAdjustment,
    ManualJournal, ManualJournalLine,
    Account,
)
from app.api.v1.gl_helpers import post_gl


# ── Shared helpers ─────────────────────────────────────────────────────────────

async def _get_or_create_contact(
    db: AsyncSession, org_id: UUID, data: dict, contact_type: str = "vendor"
) -> Contact:
    name = (
        data.get("vendor_name")
        or data.get("customer_name")
        or data.get("contact_name")
        or "Unknown"
    )
    result = await db.execute(
        select(Contact).where(Contact.organization_id == org_id, Contact.name == name)
    )
    contact = result.scalar_one_or_none()
    if not contact:
        contact = Contact(
            organization_id=org_id,
            name=name,
            type=contact_type,
            address=data.get("vendor_address") or data.get("customer_address"),
        )
        db.add(contact)
        await db.flush()
    return contact


def _parse_date(val, fallback: datetime) -> datetime:
    if not val:
        return fallback
    try:
        s = str(val).replace("/", "-")
        dt = datetime.fromisoformat(s)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return dt
    except (ValueError, AttributeError):
        return fallback


def _extract_amounts(data: dict) -> tuple[float, float, float]:
    subtotal = float(data.get("subtotal", 0) or 0)
    tax = float(data.get("tax_amount", 0) or 0)
    total = float(data.get("total", 0) or 0) or (subtotal + tax)
    if subtotal == 0 and total:
        subtotal = total - tax
    return round(subtotal, 2), round(tax, 2), round(total, 2)


def _extract_line_items(data: dict, fallback_desc: str = "From document") -> list[dict]:
    items = data.get("line_items", []) or []
    if not items:
        _, _, total = _extract_amounts(data)
        return [{"description": fallback_desc, "quantity": 1.0, "unit_price": total, "amount": total}]
    result = []
    for item in items:
        qty = float(item.get("quantity", 1) or 1)
        amt = float(item.get("amount", 0) or 0)
        unit_price = float(item.get("unit_price", 0) or 0) or (amt / qty if qty else 0)
        result.append({
            "description": str(item.get("description", "Item")),
            "quantity": qty,
            "unit_price": round(unit_price, 2),
            "amount": round(amt or qty * unit_price, 2),
        })
    return result


async def _next_number(
    db: AsyncSession, model_class, number_field_name: str, org_id: UUID, prefix: str
) -> str:
    number_col = getattr(model_class, number_field_name)
    count = (
        await db.execute(
            select(func.count())
            .select_from(model_class)
            .where(model_class.organization_id == org_id)
        )
    ).scalar() or 0
    return f"{prefix}-{count + 1:04d}"


def _gl_entries(journal_lines: list[dict]) -> list[tuple[str, float, float]]:
    return [(ln["account_code"], float(ln["debit"]), float(ln["credit"])) for ln in journal_lines]


# Public alias used by tests
def _build_gl_entries_from_lines(journal_lines: list[dict]) -> list[tuple[str, float, float]]:
    return _gl_entries(journal_lines)


# ── Module handlers ────────────────────────────────────────────────────────────

async def create_invoice_record(
    db: AsyncSession, org_id: UUID, data: dict,
    journal_lines: list[dict], date: datetime, ref: str,
) -> tuple[UUID, str, str, str]:
    contact = await _get_or_create_contact(db, org_id, data, "customer")
    subtotal, tax, total = _extract_amounts(data)
    currency = str(data.get("currency", "MYR") or "MYR")
    number = data.get("invoice_number") or await _next_number(db, Invoice, "invoice_number", org_id, "INV")
    due = _parse_date(data.get("due_date"), date + timedelta(days=30))

    record = Invoice(
        organization_id=org_id, contact_id=contact.id,
        invoice_number=number, status="draft",
        issue_date=date, due_date=due,
        subtotal=subtotal, tax_amount=tax, total=total, currency=currency,
    )
    db.add(record)
    await db.flush()

    for i, item in enumerate(_extract_line_items(data)):
        db.add(InvoiceLineItem(
            invoice_id=record.id, description=item["description"],
            quantity=item["quantity"], unit_price=item["unit_price"],
            amount=item["amount"], sort_order=i,
        ))

    await post_gl(db, org_id, date, f"Invoice {number}", number, "invoice", record.id, _gl_entries(journal_lines))
    return record.id, number, "invoice", f"/sales/invoices/{record.id}"


async def create_bill_record(
    db: AsyncSession, org_id: UUID, data: dict,
    journal_lines: list[dict], date: datetime, ref: str,
) -> tuple[UUID, str, str, str]:
    contact = await _get_or_create_contact(db, org_id, data, "vendor")
    subtotal, tax, total = _extract_amounts(data)
    currency = str(data.get("currency", "MYR") or "MYR")
    number = (
        data.get("invoice_number")
        or data.get("po_number")
        or await _next_number(db, Bill, "bill_number", org_id, "BILL")
    )
    due = _parse_date(data.get("due_date"), date + timedelta(days=30))

    record = Bill(
        organization_id=org_id, contact_id=contact.id,
        bill_number=number, status="draft",
        issue_date=date, due_date=due,
        subtotal=subtotal, tax_amount=tax, total=total, currency=currency,
    )
    db.add(record)
    await db.flush()

    for i, item in enumerate(_extract_line_items(data)):
        db.add(BillLineItem(
            bill_id=record.id, description=item["description"],
            quantity=item["quantity"], unit_price=item["unit_price"],
            amount=item["amount"], sort_order=i,
        ))

    await post_gl(db, org_id, date, f"Bill {number}", number, "bill", record.id, _gl_entries(journal_lines))
    return record.id, number, "bill", f"/purchases/bills/{record.id}"


async def create_grn_record(
    db: AsyncSession, org_id: UUID, data: dict,
    journal_lines: list[dict], date: datetime, ref: str,
) -> tuple[UUID, str, str, str]:
    contact = await _get_or_create_contact(db, org_id, data, "vendor")
    subtotal, tax, total = _extract_amounts(data)
    currency = str(data.get("currency", "MYR") or "MYR")
    grn_number = f"GRN-{date.strftime('%Y%m')}-{random.randint(1000, 9999)}"

    record = GoodsReceivedNote(
        organization_id=org_id, contact_id=contact.id,
        grn_number=grn_number, received_date=date,
        currency=currency, status="received",
    )
    db.add(record)
    await db.flush()

    for i, item in enumerate(_extract_line_items(data)):
        qty = item["quantity"]
        db.add(GRNLineItem(
            grn_id=record.id, description=item["description"],
            quantity_ordered=qty, quantity_received=qty,
            unit_price=item["unit_price"], sort_order=i,
        ))

    await post_gl(db, org_id, date, f"GRN {grn_number} — goods received", grn_number, "grn", record.id, _gl_entries(journal_lines))
    return record.id, grn_number, "grn", f"/purchases/goods-received-notes/{record.id}"


async def create_credit_note_record(
    db: AsyncSession, org_id: UUID, data: dict,
    journal_lines: list[dict], date: datetime, ref: str,
) -> tuple[UUID, str, str, str]:
    contact = await _get_or_create_contact(db, org_id, data, "customer")
    subtotal, tax, total = _extract_amounts(data)
    currency = str(data.get("currency", "MYR") or "MYR")
    number = (
        data.get("cn_number")
        or data.get("credit_note_number")
        or await _next_number(db, CreditNote, "credit_note_number", org_id, "CN")
    )

    record = CreditNote(
        organization_id=org_id, contact_id=contact.id,
        credit_note_number=number, status="issued",
        issue_date=date, subtotal=subtotal, tax_amount=tax, total=total, currency=currency,
    )
    db.add(record)
    await db.flush()

    for i, item in enumerate(_extract_line_items(data)):
        db.add(CreditNoteLineItem(
            credit_note_id=record.id, description=item["description"],
            quantity=item["quantity"], unit_price=item["unit_price"],
            amount=item["amount"], sort_order=i,
        ))

    await post_gl(db, org_id, date, f"Credit Note {number}", number, "credit_note", record.id, _gl_entries(journal_lines))
    return record.id, number, "credit_note", f"/sales/credit-notes/{record.id}"


async def create_vendor_credit_record(
    db: AsyncSession, org_id: UUID, data: dict,
    journal_lines: list[dict], date: datetime, ref: str,
) -> tuple[UUID, str, str, str]:
    """Handles both vendor_credit and debit_note categories (purchase-side credit)."""
    contact = await _get_or_create_contact(db, org_id, data, "vendor")
    subtotal, tax, total = _extract_amounts(data)
    currency = str(data.get("currency", "MYR") or "MYR")
    number = (
        data.get("vc_number")
        or data.get("dn_number")
        or await _next_number(db, VendorCredit, "vendor_credit_number", org_id, "VC")
    )
    items = _extract_line_items(data)

    record = VendorCredit(
        organization_id=org_id, contact_id=contact.id,
        vendor_credit_number=number, issue_date=date,
        status="open", currency=currency,
        subtotal=subtotal, tax_amount=tax, total=total,
        line_items=[
            {"description": it["description"], "quantity": it["quantity"],
             "unit_price": it["unit_price"], "amount": it["amount"]}
            for it in items
        ],
    )
    db.add(record)
    await db.flush()

    await post_gl(db, org_id, date, f"Vendor Credit {number}", number, "vendor_credit", record.id, _gl_entries(journal_lines))
    return record.id, number, "vendor_credit", f"/purchases/vendor-credits/{record.id}"


async def create_purchase_payment_record(
    db: AsyncSession, org_id: UUID, data: dict,
    journal_lines: list[dict], date: datetime, ref: str,
) -> tuple[UUID, str, str, str]:
    contact = await _get_or_create_contact(db, org_id, data, "vendor")
    _, _, total = _extract_amounts(data)
    currency = str(data.get("currency", "MYR") or "MYR")
    number = await _next_number(db, PurchasePayment, "payment_no", org_id, "PPAY")

    record = PurchasePayment(
        organization_id=org_id, contact_id=contact.id,
        payment_no=number, payment_date=date,
        amount=total, currency=currency,
        payment_method="bank_transfer",
        reference_no=ref, status="completed",
    )
    db.add(record)
    await db.flush()

    await post_gl(db, org_id, date, f"Purchase Payment {number}", number, "purchase_payment", record.id, _gl_entries(journal_lines))
    return record.id, number, "purchase_payment", f"/purchases/payments/{record.id}"


async def create_purchase_refund_record(
    db: AsyncSession, org_id: UUID, data: dict,
    journal_lines: list[dict], date: datetime, ref: str,
) -> tuple[UUID, str, str, str]:
    contact = await _get_or_create_contact(db, org_id, data, "vendor")
    _, _, total = _extract_amounts(data)
    currency = str(data.get("currency", "MYR") or "MYR")
    number = await _next_number(db, PurchaseRefund, "refund_no", org_id, "PREF")

    record = PurchaseRefund(
        organization_id=org_id, contact_id=contact.id,
        refund_no=number, refund_date=date,
        amount=total, currency=currency,
        payment_method="bank_transfer",
        reference_no=ref, status="completed",
    )
    db.add(record)
    await db.flush()

    await post_gl(db, org_id, date, f"Purchase Refund {number}", number, "purchase_refund", record.id, _gl_entries(journal_lines))
    return record.id, number, "purchase_refund", f"/purchases/refunds/{record.id}"


async def create_sale_receipt_record(
    db: AsyncSession, org_id: UUID, data: dict,
    journal_lines: list[dict], date: datetime, ref: str,
) -> tuple[UUID, str, str, str]:
    contact = await _get_or_create_contact(db, org_id, data, "customer")
    subtotal, tax, total = _extract_amounts(data)
    currency = str(data.get("currency", "MYR") or "MYR")
    number = await _next_number(db, SaleReceipt, "receipt_number", org_id, "REC")
    items = _extract_line_items(data)

    record = SaleReceipt(
        organization_id=org_id, contact_id=contact.id,
        receipt_number=number, receipt_date=date,
        status="completed", currency=currency,
        subtotal=subtotal, tax_amount=tax, total=total,
        payment_method="cash",
        line_items=[
            {"description": it["description"], "quantity": it["quantity"],
             "unit_price": it["unit_price"], "amount": it["amount"]}
            for it in items
        ],
    )
    db.add(record)
    await db.flush()

    await post_gl(db, org_id, date, f"Sales Receipt {number}", number, "sale_receipt", record.id, _gl_entries(journal_lines))
    return record.id, number, "sale_receipt", f"/sales/receipts/{record.id}"


async def create_stock_adjustment_record(
    db: AsyncSession, org_id: UUID, data: dict,
    journal_lines: list[dict], date: datetime, ref: str,
) -> tuple[UUID, str, str, str]:
    _, _, total = _extract_amounts(data)
    number = await _next_number(db, StockAdjustment, "adjustment_no", org_id, "ADJ")
    items = _extract_line_items(data)

    record = StockAdjustment(
        organization_id=org_id,
        adjustment_no=number, adjustment_date=date,
        reference_no=ref,
        reason=data.get("notes", "Stock adjustment from document"),
        status="confirmed",
        lines=[
            {"product_name": it["description"], "qty": it["quantity"],
             "unit_cost": it["unit_price"]}
            for it in items
        ],
    )
    db.add(record)
    await db.flush()

    if journal_lines:
        await post_gl(db, org_id, date, f"Stock Adjustment {number}", number, "stock_adjustment", record.id, _gl_entries(journal_lines))
    return record.id, number, "stock_adjustment", f"/inventory/adjustments/{record.id}"


async def create_manual_journal_record(
    db: AsyncSession, org_id: UUID, data: dict,
    journal_lines: list[dict], date: datetime, ref: str,
    user_id: UUID | None = None,
) -> tuple[UUID, str, str, str]:
    number = await _next_number(db, ManualJournal, "journal_number", org_id, "JNL")
    currency = str(data.get("currency", "MYR") or "MYR")

    record = ManualJournal(
        organization_id=org_id, journal_number=number,
        date=date, reference=ref,
        description=data.get("notes") or f"Journal from document",
        status="posted", currency=currency,
        created_by=user_id,
    )
    db.add(record)
    await db.flush()

    for ln in journal_lines:
        acct_result = await db.execute(
            select(Account).where(
                Account.organization_id == org_id,
                Account.code == ln["account_code"],
            )
        )
        acct = acct_result.scalar_one_or_none()
        if acct:
            db.add(ManualJournalLine(
                journal_id=record.id,
                account_id=acct.id,
                description=ln.get("description"),
                debit=float(ln["debit"]),
                credit=float(ln["credit"]),
            ))

    if journal_lines:
        await post_gl(db, org_id, date, f"Journal {number}", number, "manual_journal", record.id, _gl_entries(journal_lines))
    return record.id, number, "manual_journal", f"/accounting/journals/{record.id}"


# ── Main router ────────────────────────────────────────────────────────────────

# Maps category → (handler_fn, gl_source_label, friendly_name)
_HANDLERS = {
    "invoice":          (create_invoice_record,          "Sales Invoice"),
    "receipt":          (create_sale_receipt_record,     "Sales Receipt"),
    "credit_note":      (create_credit_note_record,      "Credit Note"),
    "debit_note":       (create_vendor_credit_record,    "Vendor Credit (Debit Note)"),
    "bill":             (create_bill_record,             "Bill"),
    "purchase_order":   (create_bill_record,             "Bill (from PO)"),
    "delivery_note":    (create_grn_record,              "Goods Received Note"),
    "vendor_credit":    (create_vendor_credit_record,    "Vendor Credit"),
    "payment":          (create_purchase_payment_record, "Purchase Payment"),
    "refund":           (create_purchase_refund_record,  "Purchase Refund"),
    "stock_adjustment": (create_stock_adjustment_record, "Stock Adjustment"),
    "stock_transfer":   (create_manual_journal_record,   "Manual Journal (Stock Transfer)"),
    "stock_value":      (create_manual_journal_record,   "Manual Journal (Stock Value)"),
    "bank_statement":   (create_manual_journal_record,   "Manual Journal (Bank Statement)"),
    "quotation":        (create_manual_journal_record,   "Manual Journal (Quotation)"),
    "other":            (create_manual_journal_record,   "Manual Journal"),
}

# Frontend button label per category
CONFIRM_LABELS = {
    "invoice":          "Confirm & Create Invoice",
    "receipt":          "Confirm & Create Receipt",
    "credit_note":      "Confirm & Create Credit Note",
    "debit_note":       "Confirm & Create Vendor Credit",
    "bill":             "Confirm & Create Bill",
    "purchase_order":   "Confirm & Create Bill",
    "delivery_note":    "Confirm & Create GRN",
    "vendor_credit":    "Confirm & Create Vendor Credit",
    "payment":          "Confirm & Record Payment",
    "refund":           "Confirm & Record Refund",
    "stock_adjustment": "Confirm & Record Adjustment",
    "stock_transfer":   "Confirm & Post Journal",
    "stock_value":      "Confirm & Post Journal",
    "bank_statement":   "Confirm & Post Journal",
    "quotation":        "Confirm & Post Journal",
    "other":            "Confirm & Post Journal",
}


async def route_document_to_module(
    db: AsyncSession,
    org_id: UUID,
    category: str,
    data: dict,
    journal_lines: list[dict],
    date: datetime,
    ref: str,
    user_id: UUID | None = None,
) -> dict:
    """
    Create the correct module record and post GL.
    Returns a dict with record_id, record_number, record_type, module_url.
    """
    handler, friendly = _HANDLERS.get(category, (_HANDLERS["other"][0], "Manual Journal"))

    # Pass user_id only to handlers that accept it (manual journal)
    if handler is create_manual_journal_record:
        record_id, number, record_type, url = await handler(
            db, org_id, data, journal_lines, date, ref, user_id
        )
    else:
        record_id, number, record_type, url = await handler(
            db, org_id, data, journal_lines, date, ref
        )

    return {
        "record_id": str(record_id),
        "record_number": number,
        "record_type": record_type,
        "module_url": url,
        "friendly_name": friendly,
    }
