"""
Depreciation math — pure functions, no DB.

Methods:
  straight_line     — (cost - salvage) / (life x 12) per month, constant.
  reducing_balance  — double-declining: NBV x (2/life)/12 per month, floored so
                      NBV never drops below salvage value.

All amounts rounded to 2dp; the final period absorbs the rounding remainder so
an asset depreciates to exactly its salvage value.
"""

METHOD_STRAIGHT_LINE = "straight_line"
METHOD_REDUCING_BALANCE = "reducing_balance"


def monthly_depreciation(
    method: str,
    cost: float,
    salvage: float,
    useful_life_years: int,
    accumulated: float,
) -> float:
    """Depreciation for ONE month given what's been accumulated so far.
    Returns 0 when the asset is fully depreciated (NBV <= salvage)."""
    cost, salvage, accumulated = float(cost or 0), float(salvage or 0), float(accumulated or 0)
    life_months = max(1, int(useful_life_years or 1) * 12)
    depreciable = round(cost - salvage, 2)
    remaining = round(depreciable - accumulated, 2)
    if depreciable <= 0 or remaining <= 0:
        return 0.0

    if method == METHOD_REDUCING_BALANCE:
        nbv = cost - accumulated
        rate = 2.0 / max(1, int(useful_life_years or 1))
        amount = round(nbv * rate / 12.0, 2)
    else:  # straight line (default)
        amount = round(depreciable / life_months, 2)

    return min(max(amount, 0.0), remaining)


def depreciation_schedule(
    method: str,
    cost: float,
    salvage: float,
    useful_life_years: int,
    accumulated: float = 0.0,
    max_periods: int = 600,
) -> list[dict]:
    """Full month-by-month schedule from the current accumulated position until
    fully depreciated: [{period, amount, accumulated, net_book_value}]."""
    schedule = []
    acc = float(accumulated or 0)
    for period in range(1, max_periods + 1):
        amount = monthly_depreciation(method, cost, salvage, useful_life_years, acc)
        if amount <= 0:
            break
        acc = round(acc + amount, 2)
        schedule.append({
            "period": period,
            "amount": amount,
            "accumulated": acc,
            "net_book_value": round(float(cost) - acc, 2),
        })
    return schedule
