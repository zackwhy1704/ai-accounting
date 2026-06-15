"""Backward-compat shim: app.models.models still importable as a flat module.

The models package was split into domain submodules. Many call sites do
`from app.models.models import X`; this re-exports everything so those keep working.
"""
from app.models import *  # noqa: F401,F403
from app.models import (  # explicit re-exports for names star may not propagate
    auth, accounting, sales, purchases, banking, stock, documents, settings,
)

# Re-export the backward-compat alias defined in purchases
from app.models.purchases import VendorCredit  # noqa: F401
