"""
Tests for Pydantic validators added in Phase 2B.
Pure unit tests — no DB or server needed.
"""
import pytest
from datetime import datetime, timezone, timedelta
from uuid import uuid4
from pydantic import ValidationError


def now():
    return datetime.now(timezone.utc)


def tomorrow():
    return datetime.now(timezone.utc) + timedelta(days=1)


def valid_line_item():
    from app.schemas.sales import LineItemCreate
    return LineItemCreate(description="Test item", unit_price=100.0, quantity=1)


class TestInvoiceCreateValidators:
    def test_accepts_valid_invoice(self):
        from app.schemas.sales import InvoiceCreate
        inv = InvoiceCreate(
            contact_id=uuid4(),
            issue_date=now(),
            due_date=tomorrow(),
            line_items=[valid_line_item()],
        )
        assert inv.contact_id is not None

    def test_rejects_empty_line_items(self):
        from app.schemas.sales import InvoiceCreate
        with pytest.raises(ValidationError) as exc_info:
            InvoiceCreate(
                contact_id=uuid4(),
                issue_date=now(),
                due_date=tomorrow(),
                line_items=[],
            )
        assert "line item" in str(exc_info.value).lower()

    def test_rejects_due_date_before_issue_date(self):
        from app.schemas.sales import InvoiceCreate
        with pytest.raises(ValidationError) as exc_info:
            InvoiceCreate(
                contact_id=uuid4(),
                issue_date=tomorrow(),
                due_date=now(),
                line_items=[valid_line_item()],
            )
        assert "due_date" in str(exc_info.value)

    def test_same_due_and_issue_date_allowed(self):
        from app.schemas.sales import InvoiceCreate
        d = now()
        inv = InvoiceCreate(
            contact_id=uuid4(),
            issue_date=d,
            due_date=d,
            line_items=[valid_line_item()],
        )
        assert inv.issue_date == inv.due_date

    def test_default_currency(self):
        from app.schemas.sales import InvoiceCreate
        inv = InvoiceCreate(
            contact_id=uuid4(),
            issue_date=now(),
            due_date=tomorrow(),
            line_items=[valid_line_item()],
        )
        assert inv.currency == "SGD"


class TestBillCreateValidators:
    def test_accepts_valid_bill(self):
        from app.schemas.purchases import BillCreate
        from app.schemas.sales import LineItemCreate
        b = BillCreate(
            contact_id=uuid4(),
            issue_date=now(),
            due_date=tomorrow(),
            line_items=[LineItemCreate(description="Office supplies", unit_price=50.0)],
        )
        assert b.contact_id is not None

    def test_rejects_empty_line_items(self):
        from app.schemas.purchases import BillCreate
        with pytest.raises(ValidationError):
            BillCreate(
                contact_id=uuid4(),
                issue_date=now(),
                due_date=tomorrow(),
                line_items=[],
            )

    def test_rejects_due_date_before_issue_date(self):
        from app.schemas.purchases import BillCreate
        from app.schemas.sales import LineItemCreate
        with pytest.raises(ValidationError):
            BillCreate(
                contact_id=uuid4(),
                issue_date=tomorrow(),
                due_date=now(),
                line_items=[LineItemCreate(description="Test", unit_price=10.0)],
            )


class TestUserRegisterValidators:
    def test_email_normalised_to_lowercase(self):
        from app.schemas.auth import UserRegister
        u = UserRegister(
            email="USER@EXAMPLE.COM",
            password="SecurePass1",
            full_name="Test User",
            company_name="Acme Corp",
        )
        assert u.email == "user@example.com"

    def test_email_strips_whitespace(self):
        from app.schemas.auth import UserRegister
        u = UserRegister(
            email="  test@example.com  ",
            password="SecurePass1",
            full_name="Test User",
            company_name="Acme Corp",
        )
        assert u.email == "test@example.com"

    def test_password_too_short_rejected(self):
        from app.schemas.auth import UserRegister
        with pytest.raises(ValidationError):
            UserRegister(
                email="test@example.com",
                password="abc",
                full_name="Test",
                company_name="Acme",
            )

    def test_password_without_digit_rejected(self):
        from app.schemas.auth import UserRegister
        with pytest.raises(ValidationError) as exc_info:
            UserRegister(
                email="test@example.com",
                password="noDigitsHere",
                full_name="Test",
                company_name="Acme",
            )
        assert "digit" in str(exc_info.value).lower()

    def test_valid_password_accepted(self):
        from app.schemas.auth import UserRegister
        u = UserRegister(
            email="test@example.com",
            password="ValidPass1",
            full_name="Test",
            company_name="Acme",
        )
        assert u.password == "ValidPass1"


class TestManualJournalCreateValidators:
    def test_rejects_single_line(self):
        from app.schemas.accounting import ManualJournalCreate, ManualJournalLineCreate
        with pytest.raises(ValidationError) as exc_info:
            ManualJournalCreate(
                date=now(),
                lines=[ManualJournalLineCreate(account_id=uuid4(), debit=100.0)],
            )
        assert "two lines" in str(exc_info.value).lower()

    def test_accepts_two_lines(self):
        from app.schemas.accounting import ManualJournalCreate, ManualJournalLineCreate
        mj = ManualJournalCreate(
            date=now(),
            lines=[
                ManualJournalLineCreate(account_id=uuid4(), debit=100.0),
                ManualJournalLineCreate(account_id=uuid4(), credit=100.0),
            ],
        )
        assert len(mj.lines) == 2


class TestContactCreateValidators:
    def test_rejects_empty_name(self):
        from app.schemas.settings import ContactCreate
        with pytest.raises(ValidationError):
            ContactCreate(name="   ")

    def test_trims_name(self):
        from app.schemas.settings import ContactCreate
        c = ContactCreate(name="  Acme Corp  ")
        assert c.name == "Acme Corp"

    def test_email_lowercased(self):
        from app.schemas.settings import ContactCreate
        c = ContactCreate(name="Acme", email="CONTACT@ACME.COM")
        assert c.email == "contact@acme.com"

    def test_email_none_allowed(self):
        from app.schemas.settings import ContactCreate
        c = ContactCreate(name="Acme")
        assert c.email is None
