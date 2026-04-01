"""
Mock tests for document → GRN → GL flow.
Tests the suggest-grn logic and GL entry generation with 4 different delivery note scenarios.
"""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4
from datetime import datetime, timezone


# ── Test data: 4 mock delivery note scenarios ──────────────────────────────

MOCK_DOCS = [
    {
        "id": "delivery_note_1",
        "name": "Delivery Note — Basic 3 items with SST",
        "ai_extracted_data": {
            "vendor_name": "East Asia Trading",
            "invoice_date": "2026-01-29",
            "currency": "MYR",
            "line_items": [
                {"description": "Wooden elephant figurine", "quantity": 1, "unit_price": 600.00, "amount": 600.00},
                {"description": "Large cloth rice bag", "quantity": 2, "unit_price": 45.00, "amount": 90.00},
                {"description": "Bamboo ladder", "quantity": 3, "unit_price": 20.00, "amount": 60.00},
            ],
            "subtotal": 750.00,
            "tax_amount": 45.00,  # SST 6%
            "total": 795.00,
        },
        "expected_subtotal": 750.00,
        "expected_tax": 45.00,
        "expected_total": 795.00,
        "expected_line_count": 3,
        "expected_journal_lines": 3,  # Dr Expense + Dr GST Input + Cr AP
    },
    {
        "id": "delivery_note_2",
        "name": "Delivery Note — IT equipment, no tax",
        "ai_extracted_data": {
            "vendor_name": "Tech Supplies Sdn Bhd",
            "invoice_date": "2026-02-15",
            "currency": "MYR",
            "line_items": [
                {"description": "Laptop Dell XPS 15", "quantity": 2, "unit_price": 4500.00, "amount": 9000.00},
                {"description": "Wireless Mouse Logitech MX3", "quantity": 5, "unit_price": 120.00, "amount": 600.00},
                {"description": "USB-C Hub 7-in-1", "quantity": 5, "unit_price": 85.00, "amount": 425.00},
                {"description": "Monitor 27\" 4K", "quantity": 2, "unit_price": 1800.00, "amount": 3600.00},
            ],
            "subtotal": 13625.00,
            "tax_amount": 0.0,
            "total": 13625.00,
        },
        "expected_subtotal": 13625.00,
        "expected_tax": 0.0,
        "expected_total": 13625.00,
        "expected_line_count": 4,
        "expected_journal_lines": 2,  # Dr Expense + Cr AP only (no tax)
    },
    {
        "id": "delivery_note_3",
        "name": "Delivery Note — Food & Beverage with 9% GST",
        "ai_extracted_data": {
            "vendor_name": "Fresh Produce Co",
            "invoice_date": "2026-03-01",
            "currency": "SGD",
            "line_items": [
                {"description": "Organic chicken breast (kg)", "quantity": 10, "unit_price": 12.50, "amount": 125.00},
                {"description": "Brown rice 5kg bags", "quantity": 20, "unit_price": 8.00, "amount": 160.00},
                {"description": "Fresh vegetables assorted", "quantity": 15, "unit_price": 5.50, "amount": 82.50},
            ],
            "subtotal": 367.50,
            "tax_amount": 33.08,  # GST 9%
            "total": 400.58,
        },
        "expected_subtotal": 367.50,
        "expected_tax": 33.08,
        "expected_total": 400.58,
        "expected_line_count": 3,
        "expected_journal_lines": 3,  # Dr Expense + Dr GST + Cr AP
    },
    {
        "id": "delivery_note_4",
        "name": "Delivery Note — Single high-value item, USD",
        "ai_extracted_data": {
            "vendor_name": "Industrial Machinery Ltd",
            "invoice_date": "2026-03-15",
            "currency": "USD",
            "line_items": [
                {"description": "CNC Milling Machine Model X500", "quantity": 1, "unit_price": 25000.00, "amount": 25000.00},
                {"description": "Installation & Commissioning", "quantity": 1, "unit_price": 2500.00, "amount": 2500.00},
            ],
            "subtotal": 27500.00,
            "tax_amount": 0.0,
            "total": 27500.00,
        },
        "expected_subtotal": 27500.00,
        "expected_tax": 0.0,
        "expected_total": 27500.00,
        "expected_line_count": 2,
        "expected_journal_lines": 2,  # Dr Expense + Cr AP
    },
]


# ── Unit tests for suggest-grn logic ──────────────────────────────────────

class TestGRNSuggestionLogic:
    """Tests the extraction and calculation logic for suggest-grn."""

    def _simulate_suggest_grn(self, doc_data: dict) -> dict:
        """Simulate the suggest-grn endpoint logic without DB."""
        data = doc_data["ai_extracted_data"]
        extracted_items = data.get("line_items", []) or []

        line_items = []
        subtotal = 0.0
        for item in extracted_items:
            qty = float(item.get("quantity", 1) or 1)
            unit_price = float(item.get("unit_price", 0) or 0)
            if unit_price == 0 and item.get("amount"):
                unit_price = float(item["amount"]) / qty
            amt = qty * unit_price
            subtotal += amt
            line_items.append({
                "description": item.get("description", "Item"),
                "quantity_ordered": qty,
                "quantity_received": qty,
                "unit_price": round(unit_price, 2),
            })

        tax_amount = float(data.get("tax_amount", 0) or 0)
        total = subtotal + tax_amount

        journal_preview = [
            {"account_code": "5000", "account_name": "Purchases / Expense", "debit": round(subtotal, 2), "credit": 0.0},
            {"account_code": "2000", "account_name": "Accounts Payable", "debit": 0.0, "credit": round(total, 2)},
        ]
        if tax_amount > 0:
            journal_preview.insert(1, {
                "account_code": "1200",
                "account_name": "GST / SST Input Tax",
                "debit": round(tax_amount, 2),
                "credit": 0.0,
            })

        return {
            "subtotal": round(subtotal, 2),
            "tax_amount": round(tax_amount, 2),
            "total": round(total, 2),
            "line_items": line_items,
            "journal_preview": journal_preview,
        }

    @pytest.mark.parametrize("doc", MOCK_DOCS)
    def test_subtotal_calculation(self, doc):
        result = self._simulate_suggest_grn(doc)
        assert result["subtotal"] == pytest.approx(doc["expected_subtotal"], rel=1e-2), \
            f"[{doc['name']}] Subtotal mismatch: got {result['subtotal']}, expected {doc['expected_subtotal']}"

    @pytest.mark.parametrize("doc", MOCK_DOCS)
    def test_tax_amount(self, doc):
        result = self._simulate_suggest_grn(doc)
        assert result["tax_amount"] == pytest.approx(doc["expected_tax"], rel=1e-2), \
            f"[{doc['name']}] Tax mismatch: got {result['tax_amount']}, expected {doc['expected_tax']}"

    @pytest.mark.parametrize("doc", MOCK_DOCS)
    def test_total_calculation(self, doc):
        result = self._simulate_suggest_grn(doc)
        assert result["total"] == pytest.approx(doc["expected_total"], rel=1e-2), \
            f"[{doc['name']}] Total mismatch: got {result['total']}, expected {doc['expected_total']}"

    @pytest.mark.parametrize("doc", MOCK_DOCS)
    def test_line_item_count(self, doc):
        result = self._simulate_suggest_grn(doc)
        assert len(result["line_items"]) == doc["expected_line_count"], \
            f"[{doc['name']}] Line item count mismatch"

    @pytest.mark.parametrize("doc", MOCK_DOCS)
    def test_journal_preview_line_count(self, doc):
        result = self._simulate_suggest_grn(doc)
        assert len(result["journal_preview"]) == doc["expected_journal_lines"], \
            f"[{doc['name']}] Journal line count mismatch: got {len(result['journal_preview'])}, expected {doc['expected_journal_lines']}"

    @pytest.mark.parametrize("doc", MOCK_DOCS)
    def test_journal_balances(self, doc):
        """Total debits must equal total credits."""
        result = self._simulate_suggest_grn(doc)
        total_debit = sum(jl["debit"] for jl in result["journal_preview"])
        total_credit = sum(jl["credit"] for jl in result["journal_preview"])
        assert total_debit == pytest.approx(total_credit, rel=1e-2), \
            f"[{doc['name']}] Journal doesn't balance: Dr={total_debit} Cr={total_credit}"

    @pytest.mark.parametrize("doc", MOCK_DOCS)
    def test_journal_has_ap_credit(self, doc):
        """AP (2000) must always be in credits."""
        result = self._simulate_suggest_grn(doc)
        ap_lines = [jl for jl in result["journal_preview"] if jl["account_code"] == "2000"]
        assert len(ap_lines) == 1, f"[{doc['name']}] Expected exactly 1 AP line"
        assert ap_lines[0]["credit"] > 0, f"[{doc['name']}] AP must be credited"
        assert ap_lines[0]["debit"] == 0, f"[{doc['name']}] AP must not be debited"

    @pytest.mark.parametrize("doc", MOCK_DOCS)
    def test_journal_has_expense_debit(self, doc):
        """Expense (5000) must always be in debits."""
        result = self._simulate_suggest_grn(doc)
        exp_lines = [jl for jl in result["journal_preview"] if jl["account_code"] == "5000"]
        assert len(exp_lines) == 1, f"[{doc['name']}] Expected exactly 1 expense line"
        assert exp_lines[0]["debit"] > 0, f"[{doc['name']}] Expense must be debited"

    def test_gst_line_only_when_tax_nonzero(self):
        """GST input tax line (1200) should only appear when tax > 0."""
        doc_no_tax = MOCK_DOCS[1]  # IT equipment, no tax
        result = self._simulate_suggest_grn(doc_no_tax)
        gst_lines = [jl for jl in result["journal_preview"] if jl["account_code"] == "1200"]
        assert len(gst_lines) == 0, "Should have no GST line when tax is 0"

        doc_with_tax = MOCK_DOCS[0]  # Delivery note with SST 6%
        result2 = self._simulate_suggest_grn(doc_with_tax)
        gst_lines2 = [jl for jl in result2["journal_preview"] if jl["account_code"] == "1200"]
        assert len(gst_lines2) == 1, "Should have GST line when tax > 0"

    @pytest.mark.parametrize("doc", MOCK_DOCS)
    def test_line_item_amounts_positive(self, doc):
        """All line item amounts must be positive."""
        result = self._simulate_suggest_grn(doc)
        for i, li in enumerate(result["line_items"]):
            assert li["unit_price"] >= 0, f"[{doc['name']}] Line {i} unit_price negative"
            assert li["quantity_received"] > 0, f"[{doc['name']}] Line {i} qty zero"

    @pytest.mark.parametrize("doc", MOCK_DOCS)
    def test_line_items_sum_equals_subtotal(self, doc):
        """Sum of (qty_received * unit_price) across lines must equal subtotal."""
        result = self._simulate_suggest_grn(doc)
        calculated = sum(li["quantity_received"] * li["unit_price"] for li in result["line_items"])
        assert calculated == pytest.approx(result["subtotal"], rel=1e-2), \
            f"[{doc['name']}] Line items sum {calculated} != subtotal {result['subtotal']}"


# ── GL posting tests ────────────────────────────────────────────────────────

class TestGLEntryGeneration:
    """Tests the GL entry construction logic."""

    def _build_gl_entries(self, subtotal: float, tax_amount: float) -> list:
        total = subtotal + tax_amount
        entries = [
            ("5000", round(subtotal, 2), 0),
            ("2000", 0, round(total, 2)),
        ]
        if tax_amount > 0:
            entries.append(("1200", round(tax_amount, 2), 0))
        return entries

    def test_gl_entries_balance(self):
        """All GL entries must be balanced (sum debits == sum credits)."""
        for doc in MOCK_DOCS:
            subtotal = doc["expected_subtotal"]
            tax = doc["expected_tax"]
            entries = self._build_gl_entries(subtotal, tax)
            total_dr = sum(e[1] for e in entries)
            total_cr = sum(e[2] for e in entries)
            assert total_dr == pytest.approx(total_cr, rel=1e-2), \
                f"[{doc['name']}] GL entries don't balance: Dr={total_dr} Cr={total_cr}"

    def test_gl_ap_equals_total(self):
        """AP credit must equal subtotal + tax (the full liability)."""
        for doc in MOCK_DOCS:
            subtotal = doc["expected_subtotal"]
            tax = doc["expected_tax"]
            entries = self._build_gl_entries(subtotal, tax)
            ap_credit = next(e[2] for e in entries if e[0] == "2000")
            assert ap_credit == pytest.approx(doc["expected_total"], rel=1e-2), \
                f"[{doc['name']}] AP credit {ap_credit} != total {doc['expected_total']}"

    def test_gl_expense_equals_subtotal(self):
        """Expense debit must equal subtotal (excl. tax)."""
        for doc in MOCK_DOCS:
            subtotal = doc["expected_subtotal"]
            tax = doc["expected_tax"]
            entries = self._build_gl_entries(subtotal, tax)
            exp_debit = next(e[1] for e in entries if e[0] == "5000")
            assert exp_debit == pytest.approx(subtotal, rel=1e-2), \
                f"[{doc['name']}] Expense debit {exp_debit} != subtotal {subtotal}"

    def test_gl_gst_equals_tax(self):
        """When tax > 0, GST input debit must equal tax amount."""
        doc = MOCK_DOCS[0]  # Has SST 6%
        entries = self._build_gl_entries(doc["expected_subtotal"], doc["expected_tax"])
        gst_lines = [e for e in entries if e[0] == "1200"]
        assert len(gst_lines) == 1
        assert gst_lines[0][1] == pytest.approx(doc["expected_tax"], rel=1e-2)
