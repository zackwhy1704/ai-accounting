from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user
from app.core.permissions import require_write
from app.core.pagination import PaginationParams, paginated_result, apply_sort
from app.models.models import Product
from app.schemas.schemas import ProductCreate, ProductUpdate, ProductResponse

router = APIRouter(prefix="/products", tags=["products"])


@router.get("")
async def list_products(
    active_only: bool = True,
    p: PaginationParams = Depends(),
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    org_id = current_user["org_id"]
    base = select(Product).where(Product.organization_id == org_id)
    if active_only:
        base = base.where(Product.is_active == True)
    if p.search:
        like = f"%{p.search}%"
        base = base.where(or_(
            Product.name.ilike(like),
            Product.code.ilike(like),
            Product.description.ilike(like),
        ))
    if p.date_from:
        base = base.where(Product.created_at >= p.date_from)
    if p.date_to:
        base = base.where(Product.created_at <= p.date_to)

    total = (await db.execute(select(func.count()).select_from(base.subquery()))).scalar() or 0
    query = apply_sort(base, Product, p).offset(p.offset).limit(p.limit)
    items = (await db.execute(query)).scalars().all()
    items = [ProductResponse.model_validate(i) for i in items]
    return paginated_result(items, total, p)


@router.post("", response_model=ProductResponse, status_code=201)
async def create_product(
    payload: ProductCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    product = Product(
        organization_id=current_user["org_id"],
        **payload.model_dump(),
    )
    db.add(product)
    await db.commit()
    await db.refresh(product)
    return product


@router.get("/{product_id}", response_model=ProductResponse)
async def get_product(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.organization_id == current_user["org_id"],
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    return product


@router.patch("/{product_id}", response_model=ProductResponse)
async def update_product(
    product_id: UUID,
    payload: ProductUpdate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    result = await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.organization_id == current_user["org_id"],
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    for key, val in payload.model_dump(exclude_unset=True).items():
        setattr(product, key, val)
    await db.commit()
    await db.refresh(product)
    return product


@router.delete("/{product_id}", status_code=204)
async def delete_product(
    product_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(require_write()),
):
    result = await db.execute(
        select(Product).where(
            Product.id == product_id,
            Product.organization_id == current_user["org_id"],
        )
    )
    product = result.scalar_one_or_none()
    if not product:
        raise HTTPException(status_code=404, detail="Product not found")
    product.is_active = False
    await db.commit()
