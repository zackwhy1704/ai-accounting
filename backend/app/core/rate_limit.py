"""Lightweight in-memory rate limiting for auth endpoints.

Dependency-free sliding-window limiter keyed by client IP. Adequate for a
single-instance deployment; swap the in-process store for Redis when running
multiple workers/instances.

Usage:
    login_limit = RateLimiter(max_requests=5, window_seconds=60)

    @router.post("/login", dependencies=[Depends(login_limit)])
    async def login(...): ...
"""
import time
from collections import defaultdict, deque
from fastapi import Request, HTTPException, status


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque[float]] = defaultdict(deque)

    def _client_key(self, request: Request) -> str:
        # Honor a single proxy hop if present, else the socket peer.
        fwd = request.headers.get("x-forwarded-for")
        if fwd:
            return fwd.split(",")[0].strip()
        return request.client.host if request.client else "unknown"

    async def __call__(self, request: Request) -> None:
        now = time.monotonic()
        key = self._client_key(request)
        bucket = self._hits[key]
        cutoff = now - self.window_seconds
        while bucket and bucket[0] < cutoff:
            bucket.popleft()
        if len(bucket) >= self.max_requests:
            retry = int(self.window_seconds - (now - bucket[0])) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many attempts. Please try again later.",
                headers={"Retry-After": str(max(1, retry))},
            )
        bucket.append(now)


# Shared limiters for auth endpoints (per audit Phase 6B).
login_rate_limit = RateLimiter(max_requests=5, window_seconds=60)
register_rate_limit = RateLimiter(max_requests=3, window_seconds=60)
forgot_password_rate_limit = RateLimiter(max_requests=3, window_seconds=60)
