"""Typed-ish wrapper around the identity service endpoints (via the gateway)."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .api_client import ApiClient


class IdentityApi:
    def __init__(self, client: ApiClient) -> None:
        self.client = client
        self.base = client.config.identity_base

    # ------------------------------------------------------------------- auth
    def login(self, username: str, password: str, device_id: str | None = None) -> dict[str, Any]:
        return self.client.post(
            self.base,
            "/auth/login",
            json_body={
                "username": username,
                "password": password,
                **({"deviceId": device_id} if device_id else {}),
            },
            include_auth=False,
        )

    def verify_2fa(
        self, challenge_token: str, code: str, device_id: str | None = None
    ) -> dict[str, Any]:
        return self.client.post(
            self.base,
            "/auth/2fa/verify",
            json_body={
                "challengeToken": challenge_token,
                "code": code,
                **({"deviceId": device_id} if device_id else {}),
            },
            include_auth=False,
        )

    def logout(self, refresh_token: str | None = None) -> None:
        self.client.post(
            self.base,
            "/auth/logout",
            json_body={"refreshToken": refresh_token} if refresh_token else {},
        )

    def change_password(self, old_password: str, new_password: str) -> None:
        self.client.post(
            self.base,
            "/auth/password/change",
            json_body={"oldPassword": old_password, "newPassword": new_password},
        )

    def setup_2fa(self) -> dict[str, Any]:
        return self.client.post(self.base, "/auth/2fa/setup")

    def enable_2fa(self, code: str) -> dict[str, Any]:
        return self.client.post(self.base, "/auth/2fa/enable", json_body={"code": code})

    # ---------------------------------------------------------------- profile
    def me(self) -> dict[str, Any]:
        return self.client.get(self.base, "/me")

    def my_permissions(self) -> dict[str, Any]:
        return self.client.get(self.base, "/me/permissions")

    # ------------------------------------------------------------------ users
    def list_users(
        self,
        query: str | None = None,
        status: str | None = None,
        limit: int | None = None,
    ) -> Any:
        return self.client.get(
            self.base,
            "/users",
            params={"query": query, "status": status, "limit": limit},
        )

    def get_user(self, user_id: str) -> dict[str, Any]:
        return self.client.get(self.base, f"/users/{user_id}")

    def create_user(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(self.base, "/users", json_body=dict(payload))

    def update_user(self, user_id: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.patch(self.base, f"/users/{user_id}", json_body=dict(payload))

    def lock_user(self, user_id: str, duration_minutes: int | None = None) -> dict[str, Any]:
        body = {"durationMinutes": duration_minutes} if duration_minutes is not None else {}
        return self.client.post(self.base, f"/users/{user_id}/lock", json_body=body)

    def unlock_user(self, user_id: str) -> dict[str, Any]:
        return self.client.post(self.base, f"/users/{user_id}/unlock")

    def reset_password(self, user_id: str, new_password: str | None = None) -> dict[str, Any]:
        body = {"newPassword": new_password} if new_password else {}
        return self.client.post(self.base, f"/users/{user_id}/reset-password", json_body=body)

    def assign_user_roles(self, user_id: str, role_ids: list[str]) -> Any:
        return self.client.put(
            self.base, f"/users/{user_id}/roles", json_body={"roleIds": role_ids}
        )

    # ------------------------------------------------------------------ roles
    def list_roles(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/roles")

    def get_role(self, role_id: str) -> dict[str, Any]:
        return self.client.get(self.base, f"/roles/{role_id}")

    def create_role(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(self.base, "/roles", json_body=dict(payload))

    def update_role(self, role_id: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.patch(self.base, f"/roles/{role_id}", json_body=dict(payload))

    def delete_role(self, role_id: str) -> None:
        self.client.delete(self.base, f"/roles/{role_id}")

    def request_role_permissions(
        self, role_id: str, permissions: list[Mapping[str, Any]]
    ) -> dict[str, Any]:
        return self.client.put(
            self.base,
            f"/roles/{role_id}/permissions",
            json_body={"permissions": [dict(item) for item in permissions]},
        )

    def list_permission_requests(self, status: str | None = None) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/permission-requests", params={"status": status})

    def approve_permission_request(self, request_id: str) -> dict[str, Any]:
        return self.client.post(self.base, f"/permission-requests/{request_id}/approve")

    def reject_permission_request(self, request_id: str) -> dict[str, Any]:
        return self.client.post(self.base, f"/permission-requests/{request_id}/reject")

    # ------------------------------------------------------------ permissions
    def list_permissions(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/permissions")

    # ------------------------------------------------------------------ audit
    def list_audit_logs(
        self,
        *,
        event: str | None = None,
        user_id: str | None = None,
        success: bool | None = None,
        date_from: str | None = None,
        date_to: str | None = None,
        page: int | None = None,
        limit: int | None = None,
    ) -> dict[str, Any]:
        return self.client.get(
            self.base,
            "/audit-logs",
            params={
                "event": event,
                "userId": user_id,
                "success": None if success is None else str(success).lower(),
                "from": date_from,
                "to": date_to,
                "page": page,
                "limit": limit,
            },
        )

    def list_audit_events(self) -> list[str]:
        return self.client.get(self.base, "/audit-logs/events")
