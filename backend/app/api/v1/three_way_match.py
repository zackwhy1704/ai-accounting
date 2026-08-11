"""
3-way matching: compare a Bill against its Purchase Order and Goods Received
Notes line by line — ordered vs received vs billed quantities and PO vs bill
prices. Advisory (SQL Account-style visibility): the frontend shows variances
before the user approves the bill; nothing is hard-blocked.

Lines pair by product_id when both sides carry it, else by normalized
description. The PO resolves from bills.purchase_order_id, falling back to any
GRN that links both documents.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import Bill, GoodsReceivedNote, PurchaseOrder

router = APIRouter(prefix="/bills", tags=["Bills"])

_TOL = 0.01


def _key(line) -> str:
    pid = getattr(line, "product_id", None)
    if pid:
        return f"p:{pid}"
    return "d:" + " ".join((getattr(line, "description", "") or "").lower().split())


def match_lines(po_lines, grn_lines, bill_lines) -> list[dict]:
    """Pure matcher: rows keyed by product/description with qty+price variances."""
    rows: dict[str, dict] = {}

    def slot(key, description):
        return rows.setdefault(key, {
            "description": description,
            "po_qty": 0.0, "po_unit_price": None,
            "received_qty": 0.0,
            "bill_qty": 0.0, "bill_unit_price": None,
        })

    for l in po_lines:
        r = slot(_key(l), getattr(l, "description", "") or "")
        r["po_qty"] += float(getattr(l, "quantity", 0) or 0)
        r["po_unit_price"] = float(getattr(l, "unit_price", 0) or 0)
    for l in grn_lines:
        r = slot(_key(l), getattr(l, "description", "") or "")
        r["received_qty"] += float(getattr(l, "quantity_received", 0) or 0) * float(getattr(l, "uom_factor", 1) or 1)
    for l in bill_lines:
        r = slot(_key(l), getattr(l, "description", "") or "")
        r["bill_qty"] += float(getattr(l, "quantity", 0) or 0)
        r["bill_unit_price"] = float(getattr(l, "unit_price", 0) or 0)

    out = []
    for r in rows.values():
        issues = []
        if r["bill_qty"] and r["po_qty"] and r["bill_qty"] > r["po_qty"] + _TOL:
            issues.append("billed_more_than_ordered")
        if r["bill_qty"] and r["received_qty"] and r["bill_qty"] > r["received_qty"] + _TOL:
            issues.append("billed_more_than_received")
        if r["po_qty"] and r["received_qty"] and r["received_qty"] > r["po_qty"] + _TOL:
            issues.append("received_more_than_ordered")
        if (r["po_unit_price"] is not None and r["bill_unit_price"] is not None
                and abs(r["bill_unit_price"] - r["po_unit_price"]) > _TOL):
            issues.append("price_mismatch")
        if r["bill_qty"] and not r["po_qty"] and (po_lines or []):
            issues.append("not_on_po")
        r["qty_variance"] = round(r["bill_qty"] - r["po_qty"], 4) if r["po_qty"] else None
        r["price_variance"] = (round(r["bill_unit_price"] - r["po_unit_price"], 4)
                               if r["po_unit_price"] is not None and r["bill_unit_price"] is not None else None)
        r["issues"] = issues
        r["matched"] = not issues
        out.append(r)
    return out


@router.get("/{bill_id}/three-way-match")
async def three_way_match(
    bill_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    bill = (await db.execute(
        select(Bill).options(selectinload(Bill.line_items))
        .where(Bill.id == bill_id, Bill.organization_id == org_id)
    )).scalar_one_or_none()
    if not bill:
        raise HTTPException(status_code=404, detail="Bill not found")

    grns = (await db.execute(
        select(GoodsReceivedNote).options(selectinload(GoodsReceivedNote.line_items))
        .where(GoodsReceivedNote.organization_id == org_id, GoodsReceivedNote.bill_id == bill.id)
    )).scalars().all()

    po_id = bill.purchase_order_id or next((g.purchase_order_id for g in grns if g.purchase_order_id), None)
    po = None
    if po_id:
        po = (await db.execute(
            select(PurchaseOrder).options(selectinload(PurchaseOrder.line_items))
            .where(PurchaseOrder.id == po_id, PurchaseOrder.organization_id == org_id)
        )).scalar_one_or_none()

    grn_lines = [l for g in grns for l in g.line_items]
    rows = match_lines(po.line_items if po else [], grn_lines, bill.line_items)
    return {
        "bill_id": str(bill.id), "bill_number": bill.bill_number,
        "purchase_order_id": str(po.id) if po else None,
        "po_number": po.po_number if po else None,
        "grn_ids": [str(g.id) for g in grns],
        "has_po": po is not None, "has_grn": bool(grns),
        "fully_matched": all(r["matched"] for r in rows) if rows else False,
        "rows": rows,
    }
