from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from uuid import UUID

from app.core.database import get_db
from app.core.security import get_current_user
from app.models.models import BankRule
from app.schemas.schemas import BankRuleCreate, BankRuleResponse

router = APIRouter(prefix="/bank-rules", tags=["bank-rules"])


@router.get("", response_model=list[BankRuleResponse])
async def list_bank_rules(
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(BankRule)
        .where(BankRule.organization_id == current_user["org_id"])
        .order_by(BankRule.priority.desc(), BankRule.created_at)
    )
    return result.scalars().all()


@router.post("", response_model=BankRuleResponse, status_code=201)
async def create_bank_rule(
    payload: BankRuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    rule = BankRule(
        organization_id=current_user["org_id"],
        **payload.model_dump(),
    )
    db.add(rule)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.patch("/{rule_id}", response_model=BankRuleResponse)
async def update_bank_rule(
    rule_id: UUID,
    payload: BankRuleCreate,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(BankRule).where(
            BankRule.id == rule_id,
            BankRule.organization_id == current_user["org_id"],
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Bank rule not found")
    for key, val in payload.model_dump(exclude_unset=True).items():
        setattr(rule, key, val)
    await db.commit()
    await db.refresh(rule)
    return rule


@router.delete("/{rule_id}", status_code=204)
async def delete_bank_rule(
    rule_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: dict = Depends(get_current_user),
):
    result = await db.execute(
        select(BankRule).where(
            BankRule.id == rule_id,
            BankRule.organization_id == current_user["org_id"],
        )
    )
    rule = result.scalar_one_or_none()
    if not rule:
        raise HTTPException(status_code=404, detail="Bank rule not found")
    await db.delete(rule)
    await db.commit()
