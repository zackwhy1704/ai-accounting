"""Shared pagination / search / sort infrastructure for list endpoints.

List endpoints return a stable envelope:
    {"items": [...], "total": N, "page": p, "limit": l, "pages": ceil(N/l)}

Frontend hooks unwrap `.items` so existing array consumers keep working while
gaining access to total/pages for pagination UI.
"""
from fastapi import Query


class PaginationParams:
    def __init__(
        self,
        page: int = Query(1, ge=1, description="Page number (1-based)"),
        limit: int = Query(50, ge=1, le=200, description="Items per page"),
        search: str = Query("", max_length=200, description="Free-text search"),
        sort_by: str = Query("created_at", description="Sort field"),
        sort_order: str = Query("desc", pattern="^(asc|desc)$"),
        date_from: str | None = Query(None, description="ISO date lower bound"),
        date_to: str | None = Query(None, description="ISO date upper bound"),
    ):
        self.page = page
        self.limit = limit
        self.search = search.strip()
        self.sort_by = sort_by
        self.sort_order = sort_order
        self.offset = (page - 1) * limit
        self.date_from = date_from
        self.date_to = date_to


def paginated_result(items, total: int, params: PaginationParams) -> dict:
    """Standard paginated response envelope."""
    return {
        "items": items,
        "total": total,
        "page": params.page,
        "limit": params.limit,
        "pages": max(1, (total + params.limit - 1) // params.limit),
    }


def apply_sort(query, model, params: PaginationParams, default_col_name: str = "created_at"):
    """Apply ORDER BY from params, falling back to a default column if the
    requested sort_by isn't a real column on the model."""
    col = getattr(model, params.sort_by, None) or getattr(model, default_col_name, None)
    if col is None:
        return query
    return query.order_by(col.asc() if params.sort_order == "asc" else col.desc())
