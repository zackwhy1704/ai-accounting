"""
Depreciation math — straight-line and reducing-balance monthly amounts and
full schedules. Invariants: never below salvage, terminates exactly at the
depreciable amount, zero once fully depreciated.
"""
from app.services.depreciation import (
    METHOD_REDUCING_BALANCE, METHOD_STRAIGHT_LINE,
    depreciation_schedule, monthly_depreciation,
)


def test_straight_line_monthly_amount():
    # (12000 - 0) / (5y x 12) = 200/month
    assert monthly_depreciation(METHOD_STRAIGHT_LINE, 12000, 0, 5, 0) == 200.0
    # with salvage: (12000 - 1200) / 60 = 180
    assert monthly_depreciation(METHOD_STRAIGHT_LINE, 12000, 1200, 5, 0) == 180.0


def test_straight_line_final_period_clamped():
    # accumulated 11950 of 12000 depreciable -> only 50 left, not 200
    assert monthly_depreciation(METHOD_STRAIGHT_LINE, 12000, 0, 5, 11950) == 50.0


def test_fully_depreciated_returns_zero():
    assert monthly_depreciation(METHOD_STRAIGHT_LINE, 12000, 0, 5, 12000) == 0.0
    assert monthly_depreciation(METHOD_REDUCING_BALANCE, 12000, 2000, 5, 10000) == 0.0


def test_reducing_balance_declines_each_month():
    # DDB: rate 2/5 = 40%/yr; month 1 = 12000 * 0.4/12 = 400
    first = monthly_depreciation(METHOD_REDUCING_BALANCE, 12000, 0, 5, 0)
    assert first == 400.0
    second = monthly_depreciation(METHOD_REDUCING_BALANCE, 12000, 0, 5, first)
    assert second < first
    assert second == round((12000 - 400) * 0.4 / 12, 2)


def test_reducing_balance_never_breaches_salvage():
    salvage = 3000.0
    acc = 0.0
    for _ in range(600):
        amt = monthly_depreciation(METHOD_REDUCING_BALANCE, 12000, salvage, 5, acc)
        if amt <= 0:
            break
        acc = round(acc + amt, 2)
    assert acc <= 12000 - salvage + 0.005


def test_straight_line_schedule_terminates_at_salvage():
    sched = depreciation_schedule(METHOD_STRAIGHT_LINE, 12000, 1200, 5)
    assert len(sched) == 60
    assert sched[-1]["accumulated"] == 10800.0
    assert sched[-1]["net_book_value"] == 1200.0
    assert all(s["amount"] > 0 for s in sched)


def test_schedule_rounding_absorbed_in_final_period():
    # 1000/(3y x 12) = 27.78/month with rounding drift — total must be exact
    sched = depreciation_schedule(METHOD_STRAIGHT_LINE, 1000, 0, 3)
    assert sched[-1]["accumulated"] == 1000.0
    assert sched[-1]["net_book_value"] == 0.0


def test_schedule_resumes_from_accumulated():
    sched = depreciation_schedule(METHOD_STRAIGHT_LINE, 12000, 0, 5, accumulated=11800)
    assert len(sched) == 1
    assert sched[0]["amount"] == 200.0
    assert sched[0]["net_book_value"] == 0.0


def test_unknown_method_defaults_to_straight_line():
    assert monthly_depreciation("weird", 12000, 0, 5, 0) == 200.0


def test_zero_cost_asset_no_depreciation():
    assert monthly_depreciation(METHOD_STRAIGHT_LINE, 0, 0, 5, 0) == 0.0
    assert depreciation_schedule(METHOD_STRAIGHT_LINE, 0, 0, 5) == []
