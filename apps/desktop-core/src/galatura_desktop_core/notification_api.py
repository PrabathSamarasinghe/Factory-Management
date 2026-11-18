"""Wrapper around notification service SMS status and template endpoints."""

from __future__ import annotations

from typing import Any

from .api_client import ApiClient


class NotificationApi:
    def __init__(self, client: ApiClient) -> None:
        self.client = client
        self.base = client.config.notification_base

    def list_messages(
        self,
        status: str | None = None,
        related_id: str | None = None,
        limit: int = 200,
    ) -> list[dict[str, Any]]:
        return self.client.get(
            self.base,
            "/sms",
            params={"status": status, "relatedId": related_id, "limit": limit},
        )

    def get_message(self, message_id: str) -> dict[str, Any]:
        return self.client.get(self.base, f"/sms/{message_id}")

    def resend(self, message_id: str) -> dict[str, Any]:
        return self.client.post(self.base, f"/sms/resend/{message_id}")

    def list_dead_letters(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/sms/dead-letters")

    def replay_dead_letter(self, dead_letter_id: str) -> dict[str, Any]:
        return self.client.post(self.base, f"/sms/dead-letters/{dead_letter_id}/replay")

    def list_templates(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/templates")

    def update_template(
        self, code: str, language: str, body: str, active: bool = True
    ) -> dict[str, Any]:
        return self.client.put(
            self.base,
            f"/templates/{code}/{language}",
            json_body={"body": body, "active": active},
        )
