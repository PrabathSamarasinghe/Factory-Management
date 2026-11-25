"""Idle auto-lock and sensitive-screen guard for Qt desktop apps."""

from __future__ import annotations

import logging
import time
from collections.abc import Iterator
from contextlib import contextmanager

from PySide6.QtCore import QEvent, QObject, QTimer, Signal, Slot
from PySide6.QtWidgets import QApplication

from .settings import DesktopSettings

logger = logging.getLogger(__name__)

_ACTIVITY_TYPES = {
    QEvent.Type.MouseMove,
    QEvent.Type.MouseButtonPress,
    QEvent.Type.MouseButtonRelease,
    QEvent.Type.KeyPress,
    QEvent.Type.KeyRelease,
    QEvent.Type.Wheel,
    QEvent.Type.FocusIn,
}
for _name in ("TouchBegin", "TouchUpdate", "TouchEnd"):
    _value = getattr(QEvent.Type, _name, None)
    if _value is not None:
        _ACTIVITY_TYPES.add(_value)


class IdleLock(QObject):
    locked = Signal(str)
    idle_warning = Signal(int)
    activity = Signal()

    def __init__(self, settings: DesktopSettings, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self.settings = settings
        self._app = QApplication.instance()
        self._timer = QTimer(self)
        self._timer.setInterval(1000)
        self._timer.timeout.connect(self._check)
        self._last_activity = time.monotonic()
        self._locked = False
        self._sensitive = False

    @property
    def sensitive(self) -> bool:
        return self._sensitive

    @Slot()
    def start(self) -> None:
        if self._app is not None:
            self._app.installEventFilter(self)
            self._app.setProperty("galaturaIdleLock", self)
        self.note_activity()
        self._timer.start()

    @Slot()
    def stop(self) -> None:
        self._timer.stop()
        if self._app is not None:
            self._app.removeEventFilter(self)
            if self._app.property("galaturaIdleLock") is self:
                self._app.setProperty("galaturaIdleLock", None)

    @Slot()
    def note_activity(self) -> None:
        self._last_activity = time.monotonic()
        self.activity.emit()

    def set_sensitive(self, active: bool) -> None:
        active = bool(active)
        if active == self._sensitive:
            return
        self._sensitive = active
        self.note_activity()

    @Slot(str)
    def lock(self, reason: str = "idle") -> None:
        if self._locked:
            return
        self._locked = True
        self._timer.stop()
        logger.info("Idle lock triggered: %s", reason)
        self.locked.emit(reason)

    def unlock(self) -> None:
        self._locked = False
        self.note_activity()
        self._timer.start()

    def eventFilter(self, watched: QObject, event: QEvent) -> bool:
        if not self._locked and event.type() in _ACTIVITY_TYPES:
            self.note_activity()
        return False

    def _check(self) -> None:
        if self._locked or not self.settings.idle_lock_enabled:
            return
        timeout = (
            self.settings.sensitive_idle_timeout_seconds
            if self._sensitive
            else self.settings.idle_timeout_seconds
        )
        remaining = timeout - (time.monotonic() - self._last_activity)
        if remaining <= 0:
            self.lock("sensitive" if self._sensitive else "idle")
        elif remaining <= 30:
            self.idle_warning.emit(int(remaining))


def set_sensitive_screen(active: bool) -> None:
    app = QApplication.instance()
    guard = app.property("galaturaIdleLock") if app is not None else None
    if guard is not None:
        guard.set_sensitive(active)


@contextmanager
def sensitive_screen() -> Iterator[None]:
    set_sensitive_screen(True)
    try:
        yield
    finally:
        set_sensitive_screen(False)
