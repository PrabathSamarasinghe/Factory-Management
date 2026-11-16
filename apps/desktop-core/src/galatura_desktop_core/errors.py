"""Error types raised by the desktop API client."""

from __future__ import annotations

from typing import Any


class ApiError(Exception):
    """An error returned by the backend or raised while talking to it."""

    def __init__(
        self,
        message: str,
        *,
        status: int | None = None,
        code: str | None = None,
        request_id: str | None = None,
        details: Any = None,
    ) -> None:
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code
        self.request_id = request_id
        self.details = details

    def __str__(self) -> str:  # pragma: no cover - thin formatting helper
        parts = [self.message]
        if self.code:
            parts.append(f"({self.code})")
        if self.request_id:
            parts.append(f"[request {self.request_id}]")
        return " ".join(parts)


class AuthenticationError(ApiError):
    """The session is missing, expired or the credentials were rejected."""


class NetworkError(ApiError):
    """The gateway could not be reached."""


def human_error(error: BaseException) -> str:
    """Return a short, user-friendly message for any exception."""
    if isinstance(error, ApiError):
        return str(error)
    return f"Unexpected error: {error}"
