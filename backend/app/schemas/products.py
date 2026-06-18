from pydantic import BaseModel, Field
from uuid import UUID
from datetime import datetime


# ── Products ──
class ProductCreate(BaseModel):
    code: str | None = None
    name: str
    description: str | None = None
    product_type: str = "service"          # service | inventory | non_inventory
    unit: str | None = None
    unit_price: float = Field(default=0.0, ge=0, description="Selling price; must be >= 0")
    cost_price: float = Field(default=0.0, ge=0, description="Cost price; must be >= 0")
    currency: str = "MYR"
    tax_rate_id: UUID | None = None
    income_account_id: UUID | None = None
    expense_account_id: UUID | None = None
    inventory_account_id: UUID | None = None
    track_inventory: bool = False
    qty_on_hand: float = 0.0
    reorder_point: float | None = None
    image_url: str | None = None

class ProductUpdate(BaseModel):
    code: str | None = None
    name: str | None = None
    description: str | None = None
    product_type: str | None = None
    unit: str | None = None
    unit_price: float | None = Field(default=None, ge=0)
    cost_price: float | None = Field(default=None, ge=0)
    currency: str | None = None
    tax_rate_id: UUID | None = None
    income_account_id: UUID | None = None
    expense_account_id: UUID | None = None
    inventory_account_id: UUID | None = None
    track_inventory: bool | None = None
    qty_on_hand: float | None = None
    reorder_point: float | None = None
    is_active: bool | None = None
    image_url: str | None = None

class ProductResponse(BaseModel):
    id: UUID
    organization_id: UUID
    code: str | None
    name: str
    description: str | None
    product_type: str
    unit: str | None
    unit_price: float
    cost_price: float
    currency: str
    tax_rate_id: UUID | None
    income_account_id: UUID | None
    expense_account_id: UUID | None
    inventory_account_id: UUID | None
    track_inventory: bool
    qty_on_hand: float
    reorder_point: float | None
    is_active: bool
    image_url: str | None
    created_at: datetime
    updated_at: datetime
    model_config = {"from_attributes": True}
