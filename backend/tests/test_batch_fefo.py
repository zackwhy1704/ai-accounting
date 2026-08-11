"""FEFO batch allocation — earliest expiry first, no-expiry last, oversell
lands on the last batch (mirrors the untracked engine's negative-stock rule)."""
from datetime import datetime, timezone

from app.services.inventory import fefo_allocate


class _Batch:
    def __init__(self, no, qty, expiry=None, created=None):
        self.batch_no = no
        self.qty_on_hand = qty
        self.expiry_date = expiry
        self.created_at = created or datetime(2026, 1, 1, tzinfo=timezone.utc)


def _dt(y, m, d):
    return datetime(y, m, d, tzinfo=timezone.utc)


def test_earliest_expiry_consumed_first():
    b_late = _Batch("B2", 10, expiry=_dt(2026, 12, 1))
    b_early = _Batch("B1", 10, expiry=_dt(2026, 9, 1))
    allocs = fefo_allocate([b_late, b_early], 5)
    assert allocs == [(b_early, 5.0)]


def test_spans_multiple_batches():
    b1 = _Batch("B1", 4, expiry=_dt(2026, 9, 1))
    b2 = _Batch("B2", 10, expiry=_dt(2026, 12, 1))
    allocs = fefo_allocate([b2, b1], 6)
    assert allocs == [(b1, 4.0), (b2, 2.0)]


def test_no_expiry_batches_consumed_last():
    b_noexp = _Batch("B0", 10, expiry=None, created=_dt(2025, 1, 1))
    b_exp = _Batch("B1", 3, expiry=_dt(2026, 9, 1), created=_dt(2026, 6, 1))
    allocs = fefo_allocate([b_noexp, b_exp], 5)
    assert allocs[0] == (b_exp, 3.0)
    assert allocs[1] == (b_noexp, 2.0)


def test_oversell_lands_on_last_batch():
    b1 = _Batch("B1", 3, expiry=_dt(2026, 9, 1))
    allocs = fefo_allocate([b1], 10)
    assert allocs == [(b1, 10.0)]


def test_no_batches_returns_unbatched_allocation():
    allocs = fefo_allocate([], 5)
    assert allocs == [(None, 5.0)]


def test_empty_batches_skipped():
    empty = _Batch("B0", 0, expiry=_dt(2026, 8, 1))
    live = _Batch("B1", 5, expiry=_dt(2026, 10, 1))
    allocs = fefo_allocate([empty, live], 2)
    assert allocs == [(live, 2.0)]


def test_tie_on_expiry_uses_oldest_batch():
    older = _Batch("B1", 5, expiry=_dt(2026, 9, 1), created=_dt(2026, 1, 1))
    newer = _Batch("B2", 5, expiry=_dt(2026, 9, 1), created=_dt(2026, 2, 1))
    allocs = fefo_allocate([newer, older], 6)
    assert allocs == [(older, 5.0), (newer, 1.0)]
