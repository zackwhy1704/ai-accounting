"""Shared helpers for report endpoints."""
from datetime import datetime, timezone
from fastapi import HTTPException


def parse_date(value: str, field: str = "date", *, end_of_day: bool = False) -> datetime:
    """Parse a YYYY-MM-DD (ISO) date string into a UTC datetime, or raise 400.

    Without this, a malformed/empty date hits datetime.fromisoformat -> ValueError
    -> 500 -> "error loading data" with no useful message. Returns a 400 instead.
    Set end_of_day=True for the inclusive upper bound of a range.
    """
    try:
        dt = datetime.fromisoformat(value)
    except (ValueError, TypeError):
        raise HTTPException(status_code=400, detail=f"Invalid {field} — expected YYYY-MM-DD")
    if end_of_day:
        dt = dt.replace(hour=23, minute=59, second=59)
    return dt.replace(tzinfo=timezone.utc)
