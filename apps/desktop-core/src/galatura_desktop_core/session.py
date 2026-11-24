"""Authenticated session shared by desktop windows and pages."""

from __future__ import annotations

import logging
from typing import Any

from PySide6.QtCore import QObject, Signal

from .accounts_api import AccountsApi
from .api_client import ApiClient, decode_jwt_payload
from .collection_api import CollectionApi
from .config import AppConfig, load_config
from .errors import ApiError, AuthenticationError
from .fleet_api import FleetApi
from .identity_api import IdentityApi
from .inventory_api import InventoryApi
from .notification_api import NotificationApi
from .people_api import PeopleApi

logger = logging.getLogger(__name__)


class SessionManager(QObject):
    """Owns the API client and the signed-in principal."""

    logged_in = Signal(dict)
    logged_out = Signal()
    session_expired = Signal()

    def __init__(self, config: AppConfig | None = None) -> None:
        super().__init__()
        self.config = config or load_config()
        self.client = ApiClient(self.config)
        self.identity = IdentityApi(self.client)
        self.people = PeopleApi(self.client)
        self.fleet = FleetApi(self.client)
        self.collection = CollectionApi(self.client)
        self.notification = NotificationApi(self.client)
        self.accounts = AccountsApi(self.client)
        self.inventory = InventoryApi(self.client)
        self.profile: dict[str, Any] = {}
        self.roles: list[str] = []
        self.permissions: list[str] = []
        self.scopes: dict[str, str] = {}

    # ------------------------------------------------------------------ state
    @property
    def is_authenticated(self) -> bool:
        return self.client.has_tokens() and bool(self.profile)

    @property
    def display_name(self) -> str:
        if not self.profile:
            return "Not signed in"
        return self.profile.get("username") or self.profile.get("email") or "Signed in"

    @property
    def must_change_password(self) -> bool:
        return bool(self.profile.get("mustChangePassword"))

    def has_permission(self, code: str) -> bool:
        return code in self.permissions

    # ------------------------------------------------------------------ login
    def login(self, username: str, password: str) -> dict[str, Any]:
        result = self.identity.login(username, password)
        if result.get("requires2fa"):
            return result

        tokens = result.get("tokens") or result
        self.client.set_tokens(tokens)
        try:
            self._load_principal()
        except Exception:
            self.client.clear_tokens()
            raise
        self.logged_in.emit(self.profile)
        return result

    def complete_2fa(self, challenge_token: str, code: str) -> dict[str, Any]:
        tokens = self.identity.verify_2fa(challenge_token, code)
        self.client.set_tokens(tokens)
        try:
            self._load_principal()
        except Exception:
            self.client.clear_tokens()
            raise
        self.logged_in.emit(self.profile)
        return tokens

    def restore(self) -> bool:
        """Try to resume a stored session. Safe to call from a worker thread."""
        if not self.client.restore_tokens():
            return False
        try:
            self._load_principal()
        except AuthenticationError:
            self.client.clear_tokens()
            return False
        except ApiError as exc:
            logger.warning("Could not restore session: %s", exc)
            self.client.clear_tokens()
            return False
        self.logged_in.emit(self.profile)
        return True

    def _load_principal(self) -> None:
        self.profile = self.identity.me() or {}
        summary = self.identity.my_permissions() or {}
        self.roles = list(summary.get("roles") or [])
        self.permissions = list(summary.get("permissions") or [])
        self.scopes = dict(summary.get("scopes") or {})
        self.client.set_identity(self.profile.get("id"), self.permissions)

    # ----------------------------------------------------------------- logout
    def logout(self) -> None:
        try:
            self.identity.logout(self.client.refresh_token)
        except ApiError:
            logger.debug("Logout call failed; clearing local session anyway.", exc_info=True)
        finally:
            self.client.clear_tokens()
            self.profile = {}
            self.roles = []
            self.permissions = []
            self.scopes = {}
            self.logged_out.emit()

    # --------------------------------------------------------------- helpers
    @staticmethod
    def challenge_requires_setup(challenge_token: str) -> bool:
        return bool(decode_jwt_payload(challenge_token).get("setupRequired"))
