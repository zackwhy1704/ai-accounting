from fastapi import APIRouter
from .income import router as income_router
from .balance_sheet import router as balance_sheet_router
from .ledger import router as ledger_router
from .ageing import router as ageing_router
from .stock_report import router as stock_router
from .export import router as export_router
from .stock_ledger_reports import router as stock_ledger_reports_router

router = APIRouter(prefix="/reports", tags=["reports"])
router.include_router(income_router)
router.include_router(balance_sheet_router)
router.include_router(ledger_router)
router.include_router(ageing_router)
router.include_router(export_router)
router.include_router(stock_ledger_reports_router)
router.include_router(stock_router)
