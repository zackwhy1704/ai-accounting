"""Role-based access control dependencies.

The JWT carries a `role` claim (set at login / org-switch). Roles in use:
  owner, admin       — full access incl. user/firm/billing management
  accountant, bookkeeper — may CRUD financial records, not settings/billing
  viewer             — read-only

Usage:
    @router.delete("/{id}", dependencies=[Depends(require_role("owner", "admin"))])
    async def delete_thing(...): ...

or to receive the user dict:
    async def handler(user: dict = Depends(require_role("owner", "admin"))): ...
"""
from fastapi import Depends, HTTPException, status
from app.core.security import get_current_user

# Roles allowed to create/update/delete financial records.
WRITE_ROLES = ("owner", "admin", "accountant", "bookkeeper")
# Roles allowed to manage users, firm settings, and billing.
ADMIN_ROLES = ("owner", "admin")


def require_role(*allowed_roles: str):
    """Dependency factory: 403 unless the current user's role is allowed."""
    async def checker(current_user: dict = Depends(get_current_user)) -> dict:
        role = current_user.get("role")
        if role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Insufficient permissions for this action",
            )
        return current_user
    return checker


def require_write():
    """Dependency: block read-only viewers from mutating endpoints."""
    return require_role(*WRITE_ROLES)


def require_admin():
    """Dependency: only owners/admins (user/firm/billing management)."""
    return require_role(*ADMIN_ROLES)
