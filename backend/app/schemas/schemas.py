# Backward-compat shim: schemas were split into domain modules under app.schemas.
# All `from app.schemas.schemas import X` imports continue to work via this re-export.
from app.schemas.auth import *
from app.schemas.settings import *
from app.schemas.sales import *
from app.schemas.purchases import *
from app.schemas.accounting import *
from app.schemas.products import *

# Explicit re-exports for names that `import *` may skip (aliases / not in __all__)
from app.schemas.purchases import (
    VendorCreditLineItem,
    VendorCreditCreate,
    VendorCreditResponse,
)
