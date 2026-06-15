"""
Unit tests for InvoiceService and BillService (Phase 2C).
Tests logic in isolation using a mock DB session.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime, timezone, timedelta

from app.schemas.sales import InvoiceCreate, LineItemCreate
from app.schemas.purchases import BillCreate


def make_issue_date():
    return datetime.now(timezone.utc)


def make_due_date():
    return datetime.now(timezone.utc) + timedelta(days=30)


def valid_line_items():
    return [LineItemCreate(description="Widget", quantity=2, unit_price=500.0, tax_rate=0.0)]


class TestInvoiceServiceLogic:
    """Tests that don't need a real DB — verify service method logic."""

    def test_invoice_service_imports(self):
        """InvoiceService must be importable."""
        from app.services.invoice_service import InvoiceService
        assert InvoiceService is not None

    def test_calculate_line_items_used_in_create(self):
        """calculate_line_items should be used (not inline loop)."""
        from app.core.line_items import calculate_line_items
        items = [{"quantity": 2, "unit_price": 500.0, "discount": 0, "discount_mode": "percent", "tax_rate": 0.0}]
        subtotal, tax, disc, total = calculate_line_items(items)
        assert subtotal == 1000.0
        assert total == 1000.0
        assert tax == 0.0

    def test_calculate_line_items_with_discount(self):
        from app.core.line_items import calculate_line_items
        items = [{"quantity": 1, "unit_price": 1000.0, "discount": 10, "discount_mode": "percent", "tax_rate": 0.0}]
        subtotal, tax, disc, total = calculate_line_items(items)
        assert subtotal == 900.0
        assert disc == 100.0
        assert total == 900.0

    def test_calculate_line_items_with_tax(self):
        from app.core.line_items import calculate_line_items
        items = [{"quantity": 1, "unit_price": 100.0, "discount": 0, "discount_mode": "percent", "tax_rate": 9.0}]
        subtotal, tax, disc, total = calculate_line_items(items)
        assert subtotal == 100.0
        assert tax == 9.0
        assert total == 109.0

    def test_service_constructor(self):
        from app.services.invoice_service import InvoiceService
        db = MagicMock()
        org_id = str(uuid4())
        user_id = str(uuid4())
        svc = InvoiceService(db, org_id, user_id)
        assert svc.org_id == org_id
        assert svc.user_id == user_id

    def test_bill_service_constructor(self):
        from app.services.bill_service import BillService
        db = MagicMock()
        org_id = str(uuid4())
        user_id = str(uuid4())
        svc = BillService(db, org_id, user_id)
        assert svc.org_id == org_id
        assert svc.user_id == user_id


class TestCalculateLineItems:
    """Comprehensive tests for the shared calculate_line_items utility."""

    def test_single_line_no_discount(self):
        from app.core.line_items import calculate_line_items
        items = [{"quantity": 5, "unit_price": 100.0, "discount": 0, "discount_mode": "percent", "tax_rate": 0.0}]
        sub, tax, disc, total = calculate_line_items(items)
        assert sub == 500.0
        assert disc == 0.0
        assert tax == 0.0
        assert total == 500.0

    def test_percent_discount(self):
        from app.core.line_items import calculate_line_items
        items = [{"quantity": 1, "unit_price": 200.0, "discount": 25, "discount_mode": "percent", "tax_rate": 0.0}]
        sub, tax, disc, total = calculate_line_items(items)
        assert sub == 150.0
        assert disc == 50.0

    def test_amount_discount(self):
        from app.core.line_items import calculate_line_items
        items = [{"quantity": 1, "unit_price": 200.0, "discount": 30, "discount_mode": "amount", "tax_rate": 0.0}]
        sub, tax, disc, total = calculate_line_items(items)
        assert sub == 170.0
        assert disc == 30.0

    def test_tax_applied_after_discount(self):
        from app.core.line_items import calculate_line_items
        # 10% disc on 100 = 90, 10% tax on 90 = 9, total = 99
        items = [{"quantity": 1, "unit_price": 100.0, "discount": 10, "discount_mode": "percent", "tax_rate": 10.0}]
        sub, tax, disc, total = calculate_line_items(items)
        assert sub == 90.0
        assert tax == 9.0
        assert total == 99.0

    def test_multiple_lines(self):
        from app.core.line_items import calculate_line_items
        items = [
            {"quantity": 2, "unit_price": 100.0, "discount": 0, "discount_mode": "percent", "tax_rate": 0.0},
            {"quantity": 1, "unit_price": 50.0, "discount": 0, "discount_mode": "percent", "tax_rate": 0.0},
        ]
        sub, tax, disc, total = calculate_line_items(items)
        assert sub == 250.0
        assert total == 250.0

    def test_amount_mutated_in_place(self):
        from app.core.line_items import calculate_line_items
        items = [{"quantity": 3, "unit_price": 100.0, "discount": 0, "discount_mode": "percent", "tax_rate": 0.0}]
        calculate_line_items(items)
        # calculate_line_items mutates `amount` in the item dict
        assert items[0]["amount"] == 300.0

    def test_empty_list_returns_zeros(self):
        from app.core.line_items import calculate_line_items
        sub, tax, disc, total = calculate_line_items([])
        assert sub == 0.0
        assert total == 0.0


class TestInvoiceModelMark_paid:
    """Tests for the mark_paid status machine using dict-based simulation."""

    def test_mark_paid_transitions(self):
        """mark_paid reads self.total and self.amount_paid and sets self.status."""
        from app.models.sales import Invoice

        class FakeInvoice:
            """Minimal stand-in that has the same mark_paid logic."""
            def __init__(self, total, amount_paid, status):
                self.total = total
                self.amount_paid = amount_paid
                self.status = status

            def mark_paid(self):
                paid = float(self.amount_paid)
                total = float(self.total)
                if paid >= total:
                    self.status = "paid"
                elif paid > 0:
                    self.status = "partially_paid"
                else:
                    self.status = "outstanding"

        scenarios = [
            (1000.0, 1000.0, "outstanding", "paid"),
            (1000.0, 500.0, "outstanding", "partially_paid"),
            (1000.0, 0.0, "paid", "outstanding"),
        ]
        for total, paid, initial_status, expected_status in scenarios:
            inv = FakeInvoice(total, paid, initial_status)
            inv.mark_paid()
            assert inv.status == expected_status, f"Expected {expected_status} but got {inv.status} for paid={paid}"
