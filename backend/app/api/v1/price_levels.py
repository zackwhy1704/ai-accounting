"""
Price levels — customer-tier pricing (SQL Account-style multiple price levels).

- CRUD for the tiers themselves (/price-levels)
- Per-product tier prices (GET/PUT /products/{id}/prices)
- Price resolution (/pricing/resolve): contact's tier price, falling back to
  the product's standard unit_price. The frontend line-item editor calls this
  when a product is picked for a contact.
"""
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.audit import log_audit
from app.core.database import get_db
from app.core.permissions import require_write
from app.core.security import get_current_user
from app.models.models import Contact, PriceLevel, Product, ProductPrice

router = APIRouter(tags=["price-levels"])


class PriceLevelCreate(BaseModel):
    name: str
    description: str | None = None
    is_active: bool = True


class PriceLevelUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    is_active: bool | None = None


def _dict(pl: PriceLevel) -> dict:
    return {"id": str(pl.id), "name": pl.name, "description": pl.description, "is_active": pl.is_active}


@router.get("/price-levels")
async def list_price_levels(
    include_inactive: bool = False,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    q = select(PriceLevel).where(PriceLevel.organization_id == current_user["org_id"]).order_by(PriceLevel.name)
    if not include_inactive:
        q = q.where(PriceLevel.is_active.is_(True))
    return [_dict(r) for r in (await db.execute(q)).scalars().all()]


@router.post("/price-levels", status_code=201)
async def create_price_level(payload: PriceLevelCreate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    org_id = current_user["org_id"]
    dup = (await db.execute(
        select(PriceLevel.id).where(PriceLevel.organization_id == org_id, PriceLevel.name == payload.name.strip())
    )).first()
    if dup:
        raise HTTPException(status_code=409, detail=f"Price level '{payload.name}' already exists")
    pl = PriceLevel(organization_id=org_id, name=payload.name.strip(),
                    description=payload.description, is_active=payload.is_active)
    db.add(pl)
    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "create", "price_level", pl.id)
    return _dict(pl)


@router.patch("/price-levels/{level_id}")
async def update_price_level(level_id: UUID, payload: PriceLevelUpdate, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    pl = (await db.execute(
        select(PriceLevel).where(PriceLevel.id == level_id, PriceLevel.organization_id == current_user["org_id"])
    )).scalar_one_or_none()
    if not pl:
        raise HTTPException(status_code=404, detail="Price level not found")
    for k, v in payload.model_dump(exclude_unset=True).items():
        setattr(pl, k, v)
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "update", "price_level", level_id)
    return _dict(pl)


@router.delete("/price-levels/{level_id}", status_code=204)
async def deactivate_price_level(level_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    """Soft delete — contacts may reference the tier."""
    pl = (await db.execute(
        select(PriceLevel).where(PriceLevel.id == level_id, PriceLevel.organization_id == current_user["org_id"])
    )).scalar_one_or_none()
    if not pl:
        raise HTTPException(status_code=404, detail="Price level not found")
    pl.is_active = False
    await db.commit()
    await log_audit(db, current_user["org_id"], current_user["sub"], "deactivate", "price_level", level_id)


class ProductPricesUpsert(BaseModel):
    prices: dict[UUID, float]  # price_level_id -> unit_price


@router.get("/products/{product_id}/prices")
async def get_product_prices(product_id: UUID, db: AsyncSession = Depends(get_db), current_user: dict = Depends(get_current_user)):
    org_id = current_user["org_id"]
    product = (await db.execute(
        select(Product).where(Product.id == product_id, Product.organization_id == org_id)
    )).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    rows = (await db.execute(
        select(ProductPrice, PriceLevel)
        .join(PriceLevel, PriceLevel.id == ProductPrice.price_level_id)
        .where(ProductPrice.product_id == product_id)
    )).all()
    return {
        "product_id": str(product_id),
        "standard_price": float(product.unit_price or 0),
        "prices": [{"price_level_id": str(pp.price_level_id), "price_level_name": pl.name,
                    "unit_price": float(pp.unit_price)} for pp, pl in rows],
    }


@router.put("/products/{product_id}/prices")
async def set_product_prices(product_id: UUID, payload: ProductPricesUpsert, db: AsyncSession = Depends(get_db), current_user: dict = Depends(require_write())):
    org_id = current_user["org_id"]
    product = (await db.execute(
        select(Product).where(Product.id == product_id, Product.organization_id == org_id)
    )).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    level_ids = set(payload.prices.keys())
    valid = {r for r in (await db.execute(
        select(PriceLevel.id).where(PriceLevel.organization_id == org_id, PriceLevel.id.in_(level_ids))
    )).scalars().all()}
    missing = level_ids - valid
    if missing:
        raise HTTPException(status_code=400, detail=f"Unknown price level(s): {', '.join(str(m) for m in missing)}")

    existing = {pp.price_level_id: pp for pp in (await db.execute(
        select(ProductPrice).where(ProductPrice.product_id == product_id)
    )).scalars().all()}
    for level_id, price in payload.prices.items():
        if level_id in existing:
            existing[level_id].unit_price = round(float(price), 4)
        else:
            db.add(ProductPrice(product_id=product_id, price_level_id=level_id, unit_price=round(float(price), 4)))
    await db.commit()
    await log_audit(db, org_id, current_user["sub"], "update", "product_prices", product_id)
    return await get_product_prices(product_id, db, current_user)


@router.get("/pricing/resolve")
async def resolve_price(
    product_id: UUID,
    contact_id: UUID | None = None,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    """Unit price for a product given the buying contact's price tier."""
    org_id = current_user["org_id"]
    product = (await db.execute(
        select(Product).where(Product.id == product_id, Product.organization_id == org_id)
    )).scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")

    level_id = None
    if contact_id:
        contact = (await db.execute(
            select(Contact).where(Contact.id == contact_id, Contact.organization_id == org_id)
        )).scalar_one_or_none()
        level_id = contact.price_level_id if contact else None

    tier_price = None
    if level_id:
        pp = (await db.execute(
            select(ProductPrice).where(
                ProductPrice.product_id == product_id, ProductPrice.price_level_id == level_id
            )
        )).scalar_one_or_none()
        tier_price = float(pp.unit_price) if pp else None

    return {
        "product_id": str(product_id),
        "price_level_id": str(level_id) if level_id else None,
        "unit_price": tier_price if tier_price is not None else float(product.unit_price or 0),
        "source": "price_level" if tier_price is not None else "standard",
    }
