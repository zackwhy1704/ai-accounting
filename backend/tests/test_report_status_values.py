"""Reports must not reference invalid status values."""
import pathlib

INVALID_STATUSES = {'"partial"', '"pending"', '"overdue"', '"sent"'}

def _get_reports_source():
    # Handle both old single file and new package
    p = pathlib.Path("app/api/v1/reports.py")
    if p.exists():
        return p.read_text()
    pkg = pathlib.Path("app/api/v1/reports")
    if pkg.is_dir():
        return "\n".join(f.read_text() for f in pkg.glob("*.py"))
    return ""

def test_reports_no_invalid_statuses():
    src = _get_reports_source()
    assert src, "No reports.py or reports/ package found"
    for bad in INVALID_STATUSES:
        assert bad not in src, f'reports source contains invalid status {bad}'
