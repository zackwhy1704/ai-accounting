"""
Deploy-safety guard: every third-party module the app imports must be installable
from requirements.txt. This catches the "works on dev, ModuleNotFoundError on a
fresh deploy" class of bug (reportlab was missing → /invoices/{id}/pdf would 500
on any fresh environment).

These are pure-import tests — no DB, no network.
"""
import importlib
import pathlib
import pytest

# Third-party modules the backend imports at runtime, mapped to the requirements
# package that provides them. If a module here isn't installed, the deploy is broken.
REQUIRED_RUNTIME_MODULES = [
    "fastapi", "starlette", "uvicorn",
    "sqlalchemy", "asyncpg", "alembic",
    "pydantic", "pydantic_settings",
    "jose", "passlib", "bcrypt",
    "stripe", "resend", "anthropic",
    "boto3", "aiofiles", "httpx",
    "celery",
    "reportlab",          # invoice PDF — was the missing dep
    "dateutil",           # relativedelta in recurring scheduling — also was missing
]


@pytest.mark.parametrize("module_name", REQUIRED_RUNTIME_MODULES)
def test_required_module_importable(module_name):
    importlib.import_module(module_name)


def test_app_main_imports():
    """The whole app must import cleanly — the single check that would have caught
    every prior 'missing dependency' Docker build failure."""
    import app.main  # noqa: F401


def test_requirements_declares_pdf_and_dateutil():
    """Guard against re-dropping the two deps that previously slipped."""
    req = pathlib.Path("requirements.txt").read_text().lower()
    assert "reportlab" in req, "reportlab must be declared in requirements.txt"
    assert "python-dateutil" in req or "dateutil" in req, "python-dateutil must be declared"
