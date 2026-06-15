"""Unit tests for RBAC enforcement dependencies.
Tests call the checker coroutines directly with fake user dicts — no HTTP needed.
"""
import pytest
from fastapi import HTTPException
from unittest.mock import AsyncMock, patch

from app.core.permissions import require_write, require_admin, WRITE_ROLES, ADMIN_ROLES


def fake_user(role: str) -> dict:
    return {"id": "u1", "org_id": "o1", "email": "test@test.com", "role": role}


async def _call(dep_factory, role: str) -> dict:
    checker = dep_factory()
    with patch("app.core.permissions.get_current_user", new=AsyncMock(return_value=fake_user(role))):
        from fastapi import Request
        return await checker(current_user=fake_user(role))


class TestRequireWrite:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("role", list(WRITE_ROLES))
    async def test_allowed_roles_pass(self, role):
        result = await _call(require_write, role)
        assert result["role"] == role

    @pytest.mark.asyncio
    async def test_viewer_is_blocked(self):
        with pytest.raises(HTTPException) as exc:
            await _call(require_write, "viewer")
        assert exc.value.status_code == 403

    @pytest.mark.asyncio
    async def test_unknown_role_blocked(self):
        with pytest.raises(HTTPException) as exc:
            await _call(require_write, "guest")
        assert exc.value.status_code == 403


class TestRequireAdmin:
    @pytest.mark.asyncio
    @pytest.mark.parametrize("role", list(ADMIN_ROLES))
    async def test_admin_roles_pass(self, role):
        result = await _call(require_admin, role)
        assert result["role"] == role

    @pytest.mark.asyncio
    @pytest.mark.parametrize("role", ["accountant", "bookkeeper", "viewer"])
    async def test_non_admin_blocked(self, role):
        with pytest.raises(HTTPException) as exc:
            await _call(require_admin, role)
        assert exc.value.status_code == 403
