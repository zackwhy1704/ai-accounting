from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from sqlalchemy.orm import selectinload
from uuid import UUID
from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import Bill, BillLineItem
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
    query = select(Bill).options(selectinload(Bill.line_items)).where(Bill.organization_id == org_id).order_by(Bill.created_at.desc())
    if status:
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

    # Calculate totals
    subtotal = 0
    tax_amount = 0
    for item in data.line_items:
        amount = item.quantity * item.unit_price
        tax = amount * (item.tax_rate / 100)
        subtotal += amount
        tax_amount += tax

    bill = Bill(
        organization_id=org_id,
        contact_id=data.contact_id,
        bill_number=data.bill_number,
        issue_date=data.issue_date,
        due_date=data.due_date,
        subtotal=subtotal,
        tax_amount=tax_amount,
        total=subtotal + tax_amount,
        currency=data.currency,
        notes=data.notes,
    )
    db.add(bill)
    await db.flush()

    for i, item in enumerate(data.line_items):
        amount = item.quantity * item.unit_price
        line = BillLineItem(
            bill_id=bill.id,
            description=item.description,
            quantity=item.quantity,
            unit_price=item.unit_price,
            tax_rate=item.tax_rate,
            amount=amount,
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

    if "line_items" in update_data:
        line_items_data = update_data.pop("line_items")

        # Delete old line items
        old_items_result = await db.execute(
            select(BillLineItem).where(BillLineItem.bill_id == bill.id)
        )
        for old_item in old_items_result.scalars().all():
            await db.delete(old_item)

        # Calculate totals
        subtotal = 0
        tax_amount = 0
        for item in data.line_items:
            amount = item.quantity * item.unit_price
            tax = amount * (item.tax_rate / 100)
            subtotal += amount
            tax_amount += tax

        bill.subtotal = subtotal
        bill.tax_amount = tax_amount
        bill.total = subtotal + tax_amount

        # Insert new line items
        for i, item in enumerate(data.line_items):
            amount = item.quantity * item.unit_price
            line = BillLineItem(
                bill_id=bill.id,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                tax_rate=item.tax_rate,
                amount=amount,
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

    valid_statuses = {"draft", "received", "approved", "paid", "overdue", "cancelled"}
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")

    prev_status = bill.status
    bill.status = status

    # draft/received → approved: post Dr Expense (+ Dr GST Input) / Cr AP
    if status == "approved" and prev_status in ("draft", "received"):
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

    # cancelled: reverse any posted GL entries
    elif status == "cancelled" and prev_status not in ("draft", "received"):
        await revert_gl(
            db, org_id, bill.id, "bill",
            bill.issue_date,
            f"Reversal: Bill {bill.bill_number} cancelled",
            bill.bill_number,
        )

    await db.commit()
    return {"status": bill.status}
