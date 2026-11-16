"""Secure token persistence.

Access and refresh tokens are stored in the operating-system keyring (Windows
Credential Manager, macOS Keychain, Secret Service on Linux). Plain files are
never used. When the keyring is unavailable (for example a CI runner) the store
falls back to process memory only.
"""

from __future__ import annotations

import json
import logging
from typing import Any

try:  # keyring is optional at import time so the package stays importable
    import keyring
    from keyring.errors import KeyringError
except ImportError:  # pragma: no cover - keyring missing in some environments
    keyring = None  # type: ignore[assignment]

    class KeyringError(Exception):  # type: ignore[no-redef]
        pass


logger = logging.getLogger(__name__)


class TokenStore:
    """Loads and saves the token bundle for one desktop account."""

    def __init__(
        self,
        service: str = "galatura-factory-management",
        account: str = "admin-console",
        *,
        disabled: bool = False,
    ) -> None:
        self.service = service
        self.account = account
        self.disabled = disabled or keyring is None
        self._memory: dict[str, Any] | None = None

        if self.disabled:
            logger.info("Token persistence disabled or keyring unavailable; using memory only.")

    def load(self) -> dict[str, Any] | None:
        if self.disabled:
            return self._memory

        try:
            raw = keyring.get_password(self.service, self.account)
        except KeyringError as exc:  # pragma: no cover - platform dependent
            logger.warning("Keyring read failed (%s); falling back to memory.", exc)
            return self._memory

        if not raw:
            return None

        try:
            return json.loads(raw)
        except json.JSONDecodeError:
            logger.warning("Stored token bundle is corrupt; clearing it.")
            self.clear()
            return None

    def save(self, tokens: dict[str, Any]) -> None:
        self._memory = dict(tokens)
        if self.disabled:
            return
        try:
            keyring.set_password(self.service, self.account, json.dumps(tokens))
        except KeyringError as exc:  # pragma: no cover - platform dependent
            logger.warning("Keyring write failed (%s); keeping tokens in memory only.", exc)

    def clear(self) -> None:
        self._memory = None
        if self.disabled:
            return
        try:
            keyring.delete_password(self.service, self.account)
        except KeyringError:
            pass
        except Exception:  # pragma: no cover - some backends raise custom errors
            logger.debug("Keyring delete failed", exc_info=True)
