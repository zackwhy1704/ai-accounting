"""Every mutation module must import and call log_audit."""
import pathlib

MUST_HAVE_AUDIT = [
    "app/api/v1/purchase_debit_notes.py",
    "app/api/v1/custom_fields.py",
    "app/api/v1/payment_links.py",
    "app/api/v1/stock.py",
]

def test_mutation_modules_have_log_audit():
    for path in MUST_HAVE_AUDIT:
        p = pathlib.Path(path)
        if p.exists():
            src = p.read_text()
            assert "log_audit" in src, f"{path} is missing log_audit"

def test_core_modules_have_log_audit():
    for name in ["invoices.py", "bills.py", "sales_payments.py", "purchase_payments.py"]:
        src = pathlib.Path(f"app/api/v1/{name}").read_text()
        assert "log_audit" in src, f"{name} is missing log_audit"
