"""Configuration for Galatura desktop apps, loaded from environment variables."""

from __future__ import annotations

import os
from dataclasses import dataclass


def _as_bool(value: str | None, default: bool = False) -> bool:
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class AppConfig:
    """Runtime configuration.

    The desktop apps always talk to the API gateway; the gateway validates the
    JWT and injects the verified principal headers for downstream services.
    """

    gateway_url: str = "http://localhost:3000"
    client_app: str = "C1"
    request_timeout: float = 20.0
    verify_tls: bool = True
    keyring_service: str = "galatura-factory-management"
    keyring_account: str = "admin-console"
    disable_keyring: bool = False

    @property
    def identity_base(self) -> str:
        return f"{self.gateway_url.rstrip('/')}/api/v1/identity"

    @property
    def people_base(self) -> str:
        return f"{self.gateway_url.rstrip('/')}/api/v1/people"

    @property
    def fleet_base(self) -> str:
        return f"{self.gateway_url.rstrip('/')}/api/v1/fleet"

    @property
    def collection_base(self) -> str:
        return f"{self.gateway_url.rstrip('/')}/api/v1/collection"

    @property
    def notification_base(self) -> str:
        return f"{self.gateway_url.rstrip('/')}/api/v1/notification"

    @property
    def accounts_base(self) -> str:
        return f"{self.gateway_url.rstrip('/')}/api/v1/accounts"


def load_config() -> AppConfig:
    return AppConfig(
        gateway_url=os.environ.get("GALATURA_GATEWAY_URL", "http://localhost:3000"),
        client_app=os.environ.get("GALATURA_CLIENT_APP", "C1"),
        request_timeout=float(os.environ.get("GALATURA_REQUEST_TIMEOUT", "20")),
        verify_tls=_as_bool(os.environ.get("GALATURA_VERIFY_TLS"), True),
        keyring_service=os.environ.get("GALATURA_KEYRING_SERVICE", "galatura-factory-management"),
        keyring_account=os.environ.get("GALATURA_KEYRING_ACCOUNT", "admin-console"),
        disable_keyring=_as_bool(os.environ.get("GALATURA_DISABLE_KEYRING"), False),
    )
