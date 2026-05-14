from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete, update as sql_update
from sqlalchemy.orm import selectinload
from uuid import UUID
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import Bill, BillLineItem, PurchasePayment
from app.schemas.schemas import BillCreate, BillUpdate, BillResponse
from .gl_helpers import post_gl, revert_gl

router = APIRouter(prefix="/bills", tags=["Bills"])


@router.get("", response_model=list[BillResponse])
async def list_bills(
    status: str | None = None,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]
    now = datetime.now(timezone.utc)

    # Auto-mark overdue: any outstanding/approved bill whose due_date is in the past
    await db.execute(
        sql_update(Bill)
        .where(
            Bill.organization_id == org_id,
            Bill.status.in_(["outstanding", "approved"]),
            Bill.due_date < now,
        )
        .values(status="overdue")
    )
    await db.commit()

    query = select(Bill).options(selectinload(Bill.line_items)).where(Bill.organization_id == org_id).order_by(Bill.created_at.desc())
    if status:
        # treat "outstanding" tab to also include "approved" and vice-versa
        if status == "outstanding":
            query = query.where(Bill.status.in_(["outstanding", "approved"]))
        else:
            query = query.where(Bill.status == status)
    result = await db.execute(query)
    return result.scalars().all()


@router.post("", response_model=BillResponse, status_code=201)
async def create_bill(
    data: BillCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]

    # Auto-generate bill number if not provided
    if data.bill_number:
        existing = (await db.execute(select(Bill.id).where(Bill.organization_id == org_id, Bill.bill_number == data.bill_number))).first()
        if existing:
            raise HTTPException(status_code=400, detail="Bill number already in use")
        bill_number = data.bill_number
    else:
        from .sales import next_sequence_number
        bill_number = await next_sequence_number(db, Bill, Bill.bill_number, org_id, "BILL")

    def _disc_amount(item) -> float:
        raw = getattr(item, 'discount', 0) or 0
        mode = getattr(item, 'discount_mode', 'percent') or 'percent'
        line_total = item.quantity * item.unit_price
        return min(raw, line_total) if mode == 'amount' else line_total * raw / 100

    # Calculate totals (discount applied before tax)
    subtotal = 0.0
    tax_amount = 0.0
    for item in data.line_items:
        line_total = item.quantity * item.unit_price
        after_disc = line_total - _disc_amount(item)
        subtotal += after_disc
        tax_amount += after_disc * (item.tax_rate / 100)

    bill = Bill(
        organization_id=org_id,
        contact_id=data.contact_id,
        bill_number=bill_number,
        issue_date=data.issue_date,
        due_date=data.due_date,
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=subtotal + tax_amount,
        currency=data.currency,
        notes=data.notes,
        terms=data.terms,
        billing_address_line1=data.billing_address_line1,
        billing_address_line2=data.billing_address_line2,
        billing_city=data.billing_city,
        billing_state=data.billing_state,
        billing_postcode=data.billing_postcode,
        billing_country=data.billing_country,
        shipping_address_line1=data.shipping_address_line1,
        shipping_address_line2=data.shipping_address_line2,
        shipping_city=data.shipping_city,
        shipping_state=data.shipping_state,
        shipping_postcode=data.shipping_postcode,
        shipping_country=data.shipping_country,
    )
    db.add(bill)
    await db.flush()

    for i, item in enumerate(data.line_items):
        after_disc = item.quantity * item.unit_price - _disc_amount(item)
        line = BillLineItem(
            bill_id=bill.id,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            tax_rate=item.tax_rate,
            tax_code_id=item.tax_code_id,
            discount=getattr(item, 'discount', 0) or 0,
            discount_mode=getattr(item, 'discount_mode', 'percent') or 'percent',
            amount=after_disc,
            account_id=item.account_id,
            sort_order=i,
        )
        db.add(line)

    # No GL entries at draft stage — posted on 'approved' status
    await db.commit()
    result = await db.execute(
        select(Bill).options(selectinload(Bill.line_items)).where(Bill.id == bill.id)
    )
    return result.scalar_one()


@router.get("/{bill_id}", response_model=BillResponse)
async def get_bill(
    bill_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Bill).options(selectinload(Bill.line_items)).where(Bill.id == bill_id, Bill.organization_id == current_user["org_id"])
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    return bill


@router.patch("/{bill_id}", response_model=BillResponse)
async def update_bill(
    bill_id: UUID,
    data: BillUpdate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]
    result = await db.execute(
        select(Bill).where(Bill.id == bill_id, Bill.organization_id == org_id)
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    update_data = data.model_dump(exclude_unset=True)

    new_bill_number = (update_data.get("bill_number") or "").strip()
    if new_bill_number and new_bill_number != bill.bill_number:
        existing = (await db.execute(select(Bill.id).where(Bill.organization_id == org_id, Bill.bill_number == new_bill_number, Bill.id != bill.id))).first()
        if existing:
            raise HTTPException(status_code=400, detail="Bill number already in use")
    if "bill_number" in update_data:
        update_data["bill_number"] = new_bill_number or bill.bill_number

    if "line_items" in update_data:
        update_data.pop("line_items")

        def _disc_upd(item) -> float:
            raw = getattr(item, 'discount', 0) or 0
            mode = getattr(item, 'discount_mode', 'percent') or 'percent'
            lt = item.quantity * item.unit_price
            return min(raw, lt) if mode == 'amount' else lt * raw / 100

        # Delete old line items atomically then flush before inserting new ones
        await db.execute(delete(BillLineItem).where(BillLineItem.bill_id == bill.id))
        await db.flush()

        subtotal = 0.0
        tax_amount = 0.0
        for item in data.line_items:
            after_disc = item.quantity * item.unit_price - _disc_upd(item)
            subtotal += after_disc
            tax_amount += after_disc * (item.tax_rate / 100)

        bill.subtotal = subtotal
        bill.tax_amount = tax_amount
        bill.total = subtotal + tax_amount

        for i, item in enumerate(data.line_items):
            after_disc = item.quantity * item.unit_price - _disc_upd(item)
            line = BillLineItem(
                bill_id=bill.id,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                tax_rate=item.tax_rate,
                tax_code_id=item.tax_code_id,
                discount=getattr(item, 'discount', 0) or 0,
                discount_mode=getattr(item, 'discount_mode', 'percent') or 'percent',
                amount=after_disc,
                account_id=item.account_id,
                sort_order=i,
            )
            db.add(line)

    # Apply scalar field updates
    for field, value in update_data.items():
        setattr(bill, field, value)

    await db.commit()
    result2 = await db.execute(
        select(Bill).options(selectinload(Bill.line_items)).where(Bill.id == bill.id)
    )
    return result2.scalar_one()


@router.patch("/{bill_id}/status")
async def update_bill_status(
    bill_id: UUID,
    status: str,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]
    result = await db.execute(
        select(Bill).where(Bill.id == bill_id, Bill.organization_id == current_user["org_id"])
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    valid_statuses = {"draft", "received", "approved", "outstanding", "paid", "overdue", "void", "cancelled"}
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    prev_status = bill.status
    bill.status = status

    # draft/received → approved/outstanding: post Dr Expense (+ Dr GST Input) / Cr AP
    if status in ("approved", "outstanding") and prev_status in ("draft", "received"):
        subtotal = float(bill.subtotal)
        tax_amount = float(bill.tax_amount)
        total = float(bill.total)
        entries = [
            ("5000", subtotal, 0),   # Dr Expense
            ("2000", 0, total),      # Cr Accounts Payable
        ]
        if tax_amount > 0:
            entries.append(("1200", tax_amount, 0))  # Dr GST Input (ITC)
        await post_gl(
            db, org_id, bill.issue_date,
            f"Bill {bill.bill_number}",
            bill.bill_number, "bill", bill.id, entries,
        )

    # void/cancelled: reverse any posted GL entries
    elif status in ("void", "cancelled") and prev_status not in ("draft", "received"):
        await revert_gl(
            db, org_id, bill.id, "bill",
            bill.issue_date,
            f"Reversal: Bill {bill.bill_number} cancelled",
            bill.bill_number,
        )

    await db.commit()
    return {"status": bill.status}


@router.delete("/{bill_id}", status_code=204)
async def delete_bill(
    bill_id: UUID,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]
    result = await db.execute(
        select(Bill).where(Bill.id == bill_id, Bill.organization_id == org_id)
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    if float(bill.amount_paid or 0) > 0:
        raise HTTPException(status_code=400, detail="This bill has payments applied. Void the payments first before deleting.")
    if bill.status not in ("draft", "void", "cancelled"):
        raise HTTPException(status_code=400, detail="Only draft or void bills can be deleted. Void the bill first.")
    await db.execute(
        delete(BillLineItem).where(BillLineItem.bill_id == bill_id)
    )
    await db.delete(bill)
    await db.commit()


class BillPaymentCreate(BaseModel):
    payment_date: datetime
    amount: float
    currency: str = "MYR"
    payment_method: str = "bank_transfer"
    reference_no: Optional[str] = None
    payment_no: Optional[str] = None
    notes: Optional[str] = None
    bank_account_id: Optional[str] = None


@router.post("/{bill_id}/pay", response_model=BillResponse, status_code=201)
async def pay_bill(
    bill_id: UUID,
    payload: BillPaymentCreate,
    current_user: dict = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    org_id = current_user["org_id"]
    result = await db.execute(
        select(Bill).options(selectinload(Bill.line_items)).where(Bill.id == bill_id, Bill.organization_id == org_id)
    )
    bill = result.scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")
    if bill.status in ("draft", "void", "paid"):
        raise HTTPException(status_code=400, detail=f"Cannot pay a bill with status '{bill.status}'")

    apply_amount = min(payload.amount, float(bill.total) - float(bill.amount_paid))
    if apply_amount <= 0:
        raise HTTPException(status_code=400, detail="Bill is already fully paid")

    # Sequential payment number
    from .sales import next_sequence_number
    payment_no = payload.payment_no or await next_sequence_number(db, PurchasePayment, PurchasePayment.payment_no, org_id, "PPY")

    payment = PurchasePayment(
        organization_id=org_id,
        payment_no=payment_no,
        contact_id=bill.contact_id,
        bill_id=bill_id,
        payment_date=payload.payment_date,
        amount=apply_amount,
        currency=payload.currency,
        payment_method=payload.payment_method,
        reference_no=payload.reference_no,
        notes=payload.notes,
        status="completed",
    )
    db.add(payment)
    await db.flush()

    # GL: Dr AP (2000) / Cr Cash/Bank (1000)
    await post_gl(
        db, org_id, payload.payment_date,
        f"Payment for Bill {bill.bill_number}",
        payment.payment_no, "purchase_payment", payment.id,
        [("2000", apply_amount, 0), ("1000", 0, apply_amount)],
    )

    bill.amount_paid = float(bill.amount_paid) + apply_amount
    bill_total = float(bill.total or 0)
    if bill.amount_paid >= bill_total:
        bill.status = "paid"
    elif bill.amount_paid > 0:
        bill.status = "partially paid"

    await db.commit()
    result2 = await db.execute(
        select(Bill).options(selectinload(Bill.line_items)).where(Bill.id == bill_id)
    )
    return result2.scalar_one()
