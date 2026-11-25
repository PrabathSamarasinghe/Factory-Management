"""Persistent desktop preferences shared by Qt apps."""

from __future__ import annotations

import os

from PySide6.QtCore import QSettings

DEFAULT_LANGUAGE = "en"
SUPPORTED_LANGUAGES = ("en", "si", "ta")
DEFAULT_IDLE_TIMEOUT_SECONDS = 900
DEFAULT_SENSITIVE_IDLE_TIMEOUT_SECONDS = 120
MIN_IDLE_TIMEOUT_SECONDS = 30


def _env_int(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, str(default)))
    except ValueError:
        return default


def _env_bool(name: str, default: bool) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


class DesktopSettings:
    def __init__(self, scope: str = "desktop", settings: QSettings | None = None) -> None:
        self.scope = scope
        self._settings = settings or QSettings("Galatura", f"Galatura {scope.title()}")

    def _key(self, name: str) -> str:
        return f"{self.scope}/{name}"

    @property
    def language(self) -> str:
        default = os.environ.get("GALATURA_LANGUAGE", DEFAULT_LANGUAGE).strip().lower()
        if default not in SUPPORTED_LANGUAGES:
            default = DEFAULT_LANGUAGE
        value = str(self._settings.value(self._key("language"), default)).strip().lower()
        return value if value in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE

    @language.setter
    def language(self, code: str) -> None:
        value = str(code).strip().lower()
        stored = value if value in SUPPORTED_LANGUAGES else DEFAULT_LANGUAGE
        self._settings.setValue(self._key("language"), stored)
        self._settings.sync()

    @property
    def idle_lock_enabled(self) -> bool:
        value = self._settings.value(
            self._key("idleLockEnabled"), _env_bool("GALATURA_IDLE_LOCK", True)
        )
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in {"1", "true", "yes", "on"}

    @idle_lock_enabled.setter
    def idle_lock_enabled(self, enabled: bool) -> None:
        self._settings.setValue(self._key("idleLockEnabled"), bool(enabled))
        self._settings.sync()

    @property
    def idle_timeout_seconds(self) -> int:
        default = max(
            MIN_IDLE_TIMEOUT_SECONDS,
            _env_int("GALATURA_IDLE_TIMEOUT_SECONDS", DEFAULT_IDLE_TIMEOUT_SECONDS),
        )
        try:
            value = int(self._settings.value(self._key("idleTimeoutSeconds"), default))
        except (TypeError, ValueError):
            return default
        return max(MIN_IDLE_TIMEOUT_SECONDS, value)

    @idle_timeout_seconds.setter
    def idle_timeout_seconds(self, seconds: int) -> None:
        self._settings.setValue(
            self._key("idleTimeoutSeconds"), max(MIN_IDLE_TIMEOUT_SECONDS, int(seconds))
        )
        self._settings.sync()

    @property
    def sensitive_idle_timeout_seconds(self) -> int:
        default = max(
            MIN_IDLE_TIMEOUT_SECONDS,
            _env_int(
                "GALATURA_SENSITIVE_IDLE_TIMEOUT_SECONDS",
                DEFAULT_SENSITIVE_IDLE_TIMEOUT_SECONDS,
            ),
        )
        try:
            value = int(
                self._settings.value(self._key("sensitiveIdleTimeoutSeconds"), default)
            )
        except (TypeError, ValueError):
            return default
        return max(MIN_IDLE_TIMEOUT_SECONDS, value)

    @sensitive_idle_timeout_seconds.setter
    def sensitive_idle_timeout_seconds(self, seconds: int) -> None:
        self._settings.setValue(
            self._key("sensitiveIdleTimeoutSeconds"),
            max(MIN_IDLE_TIMEOUT_SECONDS, int(seconds)),
        )
        self._settings.sync()

    @property
    def realtime_enabled(self) -> bool:
        value = self._settings.value(
            self._key("realtimeEnabled"), _env_bool("GALATURA_REALTIME", True)
        )
        if isinstance(value, bool):
            return value
        return str(value).strip().lower() in {"1", "true", "yes", "on"}

    @realtime_enabled.setter
    def realtime_enabled(self, enabled: bool) -> None:
        self._settings.setValue(self._key("realtimeEnabled"), bool(enabled))
        self._settings.sync()
