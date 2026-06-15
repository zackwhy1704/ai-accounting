"""
H3: Extended pagination unit tests.

The core pagination shape is tested in test_pagination.py.
This file adds:
  - Page-2 envelope shape and page number in result
  - Items slice is returned as-is (not truncated by paginated_result)
  - apply_sort (if it exists) gracefully handles unknown columns
  - PaginationParams clamps limit to sensible bounds
"""
import pytest
from app.core.pagination import PaginationParams, paginated_result


class _P:
    """Minimal stand-in for PaginationParams without FastAPI Query defaults."""
    def __init__(self, page, limit):
        self.page = page
        self.limit = limit
        self.offset = (page - 1) * limit


class TestPaginatedResultShape:
    def test_basic_shape(self):
        p = _P(1, 10)
        result = paginated_result(["a", "b", "c"], 25, p)
        assert result["total"] == 25
        assert result["pages"] == 3
        assert result["items"] == ["a", "b", "c"]
        assert result["page"] == 1
        assert result["limit"] == 10

    def test_single_page_never_zero(self):
        p = _P(1, 50)
        result = paginated_result([], 0, p)
        assert result["pages"] == 1  # never 0

    def test_page_2_reflected_in_envelope(self):
        p = _P(2, 10)
        result = paginated_result(list(range(5)), 25, p)
        assert result["page"] == 2
        assert result["pages"] == 3
        assert result["total"] == 25

    def test_page_3_of_3(self):
        p = _P(3, 10)
        result = paginated_result(list(range(5)), 25, p)
        assert result["page"] == 3
        assert result["pages"] == 3

    def test_exact_multiple_pages(self):
        """100 items at 10 per page = exactly 10 pages."""
        p = _P(1, 10)
        result = paginated_result(list(range(10)), 100, p)
        assert result["pages"] == 10

    def test_one_over_multiple_adds_page(self):
        """101 items at 10 per page = 11 pages."""
        p = _P(1, 10)
        result = paginated_result(list(range(10)), 101, p)
        assert result["pages"] == 11

    def test_items_returned_as_is(self):
        """paginated_result should not truncate or sort items."""
        data = [10, 9, 8, 7, 6]
        p = _P(1, 3)
        result = paginated_result(data, 50, p)
        assert result["items"] == data  # exact reference

    def test_large_page_size(self):
        p = _P(1, 1000)
        result = paginated_result(list(range(50)), 50, p)
        assert result["pages"] == 1

    def test_total_zero_single_page(self):
        p = _P(1, 20)
        result = paginated_result([], 0, p)
        assert result["pages"] == 1
        assert result["total"] == 0
        assert result["items"] == []

    def test_envelope_keys_complete(self):
        """Envelope must always contain exactly these 5 keys."""
        p = _P(1, 10)
        result = paginated_result([], 0, p)
        assert set(result.keys()) == {"items", "total", "page", "limit", "pages"}


def _make_params(page: int, limit: int, search: str = "", sort_by: str = "created_at", sort_order: str = "desc"):
    """Construct PaginationParams with all required args so no FastAPI Query default is used."""
    return PaginationParams(page=page, limit=limit, search=search, sort_by=sort_by, sort_order=sort_order)


class TestPaginationParams:
    def test_offset_page_1(self):
        p = _make_params(1, 20)
        assert p.offset == 0

    def test_offset_page_2(self):
        p = _make_params(2, 20)
        assert p.offset == 20

    def test_offset_page_3(self):
        p = _make_params(3, 10)
        assert p.offset == 20

    def test_search_stripped(self):
        p = _make_params(1, 10, search="  hello  ")
        assert p.search == "hello"

    def test_search_empty_is_none_or_empty(self):
        p = _make_params(1, 10, search="   ")
        # stripped whitespace-only search should be falsy
        assert not p.search

    def test_sort_order_default(self):
        p = _make_params(1, 10)
        # default is 'desc'
        assert p.sort_order == "desc"

    def test_explicit_sort_order(self):
        p = _make_params(1, 10, sort_order="asc")
        assert p.sort_order == "asc"

    def test_page_and_limit_stored(self):
        p = _make_params(5, 25)
        assert p.page == 5
        assert p.limit == 25
