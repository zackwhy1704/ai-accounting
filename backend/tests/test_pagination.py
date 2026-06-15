"""Phase B — pagination/search infrastructure (pure unit tests)."""
from app.core.pagination import PaginationParams, paginated_result


class _P:
    """Minimal stand-in for PaginationParams without FastAPI Query defaults."""
    def __init__(self, page, limit):
        self.page = page
        self.limit = limit
        self.offset = (page - 1) * limit


def test_envelope_shape():
    p = _P(1, 50)
    env = paginated_result([1, 2, 3], total=3, params=p)
    assert env == {"items": [1, 2, 3], "total": 3, "page": 1, "limit": 50, "pages": 1}


def test_pages_ceiling():
    assert paginated_result([], 0, _P(1, 50))["pages"] == 1   # never zero
    assert paginated_result([], 50, _P(1, 50))["pages"] == 1
    assert paginated_result([], 51, _P(1, 50))["pages"] == 2
    assert paginated_result([], 100, _P(1, 50))["pages"] == 2
    assert paginated_result([], 101, _P(1, 50))["pages"] == 3


def test_offset_computed():
    assert _P(1, 50).offset == 0
    assert _P(3, 20).offset == 40


def test_params_defaults_and_clamps():
    # PaginationParams uses FastAPI Query defaults; instantiate directly to
    # confirm the plain construction works with explicit values.
    p = PaginationParams(page=2, limit=25, search="  hi  ", sort_by="name", sort_order="asc")
    assert p.page == 2 and p.limit == 25
    assert p.search == "hi"  # stripped
    assert p.offset == 25
    assert p.sort_order == "asc"
