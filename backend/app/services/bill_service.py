"""Bill business logic. No FastAPI imports. No HTTP concerns."""
from __future__ import annotations

from uuid import UUID
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.purchases import Bill, BillLineItem
from app.schemas.purchases import BillCreate, BillUpdate
from app.core.line_items import calculate_line_items
from app.core.sequences import next_sequence_number
from app.core.audit import log_audit


class BillService:
    def __init__(self, db: AsyncSession, org_id: str | UUID, user_id: str | UUID):
        self.db = db
        self.org_id = str(org_id)
        self.user_id = str(user_id)

    async def create(self, data: BillCreate) -> Bill:
        number = data.bill_number or await next_sequence_number(
            self.db, Bill, Bill.bill_number, self.org_id, "BILL"
        )
        items = [li.model_dump() for li in data.line_items]
        subtotal, tax_amount, _, total = calculate_line_items(items)

        bill = Bill(
            organization_id=self.org_id,
            bill_number=number,
            contact_id=data.contact_id,
            issue_date=data.issue_date,
            due_date=data.due_date,
            currency=data.currency or "MYR",
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
            subtotal=subtotal,
            tax_amount=tax_amount,
            total=total,
            status="draft",
        )
        self.db.add(bill)
        await self.db.flush()

        for idx, item in enumerate(items):
            self.db.add(BillLineItem(bill_id=bill.id, sort_order=idx, **item))

        await log_audit(self.db, self.org_id, self.user_id, "create", "bill", bill.id)
        await self.db.commit()
        result = await self.db.execute(
            select(Bill)
            .options(selectinload(Bill.line_items))
            .where(Bill.id == bill.id)
        )
        return result.scalar_one()

    async def get(self, bill_id: UUID) -> Bill:
        result = await self.db.execute(
            select(Bill)
            .options(selectinload(Bill.line_items))
            .where(Bill.id == bill_id, Bill.organization_id == self.org_id)
        )
        bill = result.scalar_one_or_none()
        if not bill:
            raise HTTPException(status_code=404, detail="Bill not found")
        return bill

    async def update(self, bill_id: UUID, data: BillUpdate) -> Bill:
        bill = await self.get(bill_id)
        if not bill.can_edit():
            raise HTTPException(
                status_code=400,
                detail=f"Cannot edit bill with status '{bill.status}'"
            )

        update_data = data.model_dump(exclude_unset=True)

        if "line_items" in update_data:
            items_data = update_data.pop("line_items")
            items = [li.model_dump() if hasattr(li, "model_dump") else li for li in items_data]
            subtotal, tax_amount, _, total = calculate_line_items(items)
            bill.subtotal = subtotal
            bill.tax_amount = tax_amount
            bill.total = total
            if bill.status in ("paid", "partially_paid", "outstanding"):
                bill.mark_paid()
            await self.db.execute(
                __import__("sqlalchemy", fromlist=["delete"]).delete(BillLineItem)
                .where(BillLineItem.bill_id == bill.id)
            )
            for idx, item in enumerate(items):
                self.db.add(BillLineItem(bill_id=bill.id, sort_order=idx, **item))

        for key, value in update_data.items():
            setattr(bill, key, value)

        await log_audit(self.db, self.org_id, self.user_id, "update", "bill", bill_id)
        await self.db.commit()
        result = await self.db.execute(
            select(Bill)
            .options(selectinload(Bill.line_items))
            .where(Bill.id == bill_id)
        )
        return result.scalar_one()

    async def delete(self, bill_id: UUID) -> None:
        bill = await self.get(bill_id)
        if not bill.can_delete():
            raise HTTPException(
                status_code=400,
                detail=f"Cannot delete bill with status '{bill.status}'"
            )
        await log_audit(self.db, self.org_id, self.user_id, "delete", "bill", bill_id)
        await self.db.delete(bill)
        await self.db.commit()
