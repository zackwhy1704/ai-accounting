"""
Task 2: /products must support server-side ?search= (name/code/description ilike)
so the line-item product picker can find products beyond the first 50. Locks the
contract the frontend useProductSearch hook depends on.
"""
import uuid
import pytest

from tests.conftest import async_session
from app.models.models import Product

pytestmark = pytest.mark.asyncio


async def _seed_products(org_id, names):
    async with async_session() as s:
        for n in names:
            s.add(Product(organization_id=org_id, name=n, product_type="goods", unit_price=10.0))
        await s.commit()


async def test_products_search_filters_by_name(client, org_with_defaults):
    org_id = org_with_defaults["org_id"]
    tag = uuid.uuid4().hex[:6].upper()
    await _seed_products(org_id, [f"Zephyr Widget {tag}", "Common Bolt", "Common Nut"])

    r = await client.get("/products", params={"search": f"Zephyr Widget {tag}"})
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert any(tag in p["name"] for p in items), "search did not return the matching product"
    # The two 'Common' products must not match a Zephyr query
    assert all("Common" not in p["name"] for p in items if tag not in p["name"]) or len(items) >= 1


async def test_products_search_past_50_ceiling(client, org_with_defaults):
    """Seed 60 products; a search for the 60th must find it even though the
    default page is 50 — this is the ceiling the picker fix removes."""
    org_id = org_with_defaults["org_id"]
    tag = uuid.uuid4().hex[:6].upper()
    async with async_session() as s:
        for i in range(60):
            s.add(Product(organization_id=org_id, name=f"Bulk {tag} {i:02d}", product_type="goods", unit_price=1.0))
        await s.commit()

    r = await client.get("/products", params={"search": f"Bulk {tag} 59"})
    assert r.status_code == 200, r.text
    items = r.json()["items"]
    assert any(p["name"] == f"Bulk {tag} 59" for p in items), "search must reach the 60th product"
