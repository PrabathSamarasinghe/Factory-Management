"""Qt-safe realtime WebSocket client with ticket auth and reconnect."""

from __future__ import annotations

import json
import logging
from collections.abc import Sequence
from typing import Any
from urllib.parse import urlencode, urlsplit, urlunsplit

from PySide6.QtCore import (
    QMetaObject,
    QObject,
    Qt,
    QThread,
    QTimer,
    QUrl,
    Signal,
    Slot,
)
from PySide6.QtWidgets import QHBoxLayout, QLabel, QPushButton, QWidget

try:
    from PySide6.QtWebSockets import QWebSocket
except ImportError:
    QWebSocket = None

from .api_client import ApiClient
from .i18n import Translator

logger = logging.getLogger(__name__)

DEFAULT_REST_PATH = "/api/v1/realtime"
DEFAULT_CONNECT_PATH = "/realtime/connect"
CHANNEL_PERMISSIONS: dict[str, tuple[str, ...]] = {
    "admin.audit": ("audit:read",),
    "trips.live": ("trip:read", "monitor:read"),
    "weighing.live": ("weighing:read", "monitor:read"),
    "accounts.updates": ("ledger:read", "payment:read"),
    "monitor.today": ("monitor:read",),
}
_RECONNECT_CAP_SECONDS = 30.0
_HEARTBEAT_MS = 20_000


def channels_for_permissions(
    permissions: Sequence[str], requested: Sequence[str] | None = None
) -> list[str]:
    granted = set(permissions)
    candidates = list(requested) if requested is not None else list(CHANNEL_PERMISSIONS)
    return [
        channel
        for channel in candidates
        if any(permission in granted for permission in CHANNEL_PERMISSIONS.get(channel, ()))
    ]


def _websocket_url(gateway_url: str, ticket: str, connect_path: str) -> str:
    parts = urlsplit(gateway_url)
    scheme = "wss" if parts.scheme == "https" else "ws"
    path = connect_path if connect_path.startswith("/") else f"/{connect_path}"
    base_path = parts.path.rstrip("/")
    query = urlencode({"ticket": ticket})
    return urlunsplit((scheme, parts.netloc, f"{base_path}{path}", query, ""))


def _request_ticket(client: ApiClient, base: str, path: str, channels: Sequence[str]) -> str:
    payload = client.post(
        base,
        path,
        json_body={"channels": list(channels), "clientApp": client.config.client_app},
    )
    data = payload.get("data") if isinstance(payload, dict) else None
    ticket = data.get("ticket") if isinstance(data, dict) else None
    if not ticket:
        raise RuntimeError("The realtime service did not return a connection ticket.")
    return str(ticket)


def _fetch_catch_up(
    client: ApiClient, base: str, path: str, channel: str, after_id: str
) -> list[dict[str, Any]]:
    payload = client.get(base, path, params={"channel": channel, "afterId": after_id})
    data = payload.get("data") if isinstance(payload, dict) else payload
    if not isinstance(data, list):
        return []
    return [item for item in data if isinstance(item, dict)]


def _event_id(event: dict[str, Any]) -> str:
    value = event.get("id") or event.get("eventId") or event.get("sequence")
    return str(value) if value is not None else ""


class _RealtimeWorker(QObject):
    connected = Signal()
    disconnected = Signal()
    event_received = Signal(dict)
    error = Signal(str)
    stopped = Signal()

    def __init__(
        self,
        client: ApiClient,
        channels: Sequence[str],
        rest_base: str,
        ticket_path: str,
        catch_up_path: str,
        connect_path: str,
    ) -> None:
        super().__init__()
        self._client = client
        self._channels = list(channels)
        self._rest_base = rest_base
        self._ticket_path = ticket_path
        self._catch_up_path = catch_up_path
        self._connect_path = connect_path
        self._socket: Any = None
        self._running = False
        self._attempt = 0
        self._last_ids: dict[str, str] = {}
        self._heartbeat = QTimer(self)
        self._heartbeat.timeout.connect(self._ping)
        self._reconnect = QTimer(self)
        self._reconnect.setSingleShot(True)
        self._reconnect.timeout.connect(self._open)

    @Slot()
    def start(self) -> None:
        if QWebSocket is None:
            self.error.emit("Qt WebSockets support is unavailable in this PySide6 build.")
            return
        self._running = True
        self._attempt = 0
        self._open()

    @Slot()
    def stop(self) -> None:
        self._running = False
        self._heartbeat.stop()
        self._reconnect.stop()
        if self._socket is not None:
            socket = self._socket
            self._socket = None
            try:
                socket.connected.disconnect(self._on_connected)
                socket.disconnected.disconnect(self._on_disconnected)
                socket.textMessageReceived.disconnect(self._on_message)
                socket.errorOccurred.disconnect(self._on_socket_error)
            except (RuntimeError, TypeError):
                pass
            socket.close()
            socket.deleteLater()
        self.stopped.emit()

    @Slot(list)
    def update_channels(self, channels: list[str]) -> None:
        self._channels = list(channels)
        if self._socket is not None:
            self._send({"type": "subscribe", "channels": self._channels})

    def _open(self) -> None:
        if not self._running or QWebSocket is None or not self._channels:
            return
        try:
            ticket = _request_ticket(
                self._client, self._rest_base, self._ticket_path, self._channels
            )
        except Exception as exc:
            logger.debug("Could not request realtime ticket: %s", exc)
            self.error.emit(str(exc))
            self._schedule_reconnect()
            return

        url = _websocket_url(self._client.config.gateway_url, ticket, self._connect_path)
        if self._socket is None:
            self._socket = QWebSocket()
            self._socket.connected.connect(self._on_connected)
            self._socket.disconnected.connect(self._on_disconnected)
            self._socket.textMessageReceived.connect(self._on_message)
            self._socket.errorOccurred.connect(self._on_socket_error)
        self._socket.open(QUrl(url))

    def _on_connected(self) -> None:
        self._attempt = 0
        self.connected.emit()
        self._send({"type": "subscribe", "channels": self._channels})
        self._heartbeat.start(_HEARTBEAT_MS)

    def _on_disconnected(self) -> None:
        self._heartbeat.stop()
        self.disconnected.emit()
        if self._socket is not None:
            socket = self._socket
            self._socket = None
            socket.deleteLater()
        self._schedule_reconnect()

    def _on_socket_error(self, error: Any) -> None:
        self.error.emit(str(error))

    def _on_message(self, text: str) -> None:
        try:
            payload = json.loads(text)
        except ValueError:
            logger.debug("Discarding invalid realtime message.")
            return
        if not isinstance(payload, dict):
            return

        kind = payload.get("type")
        if kind == "event":
            event = payload.get("event")
            if not isinstance(event, dict):
                return
            channel = str(payload.get("channel") or "")
            event_id = _event_id(event)
            if channel and event_id:
                self._last_ids[channel] = event_id
            self.event_received.emit(
                {"channel": channel, "event": event, "catchUp": False}
            )
        elif kind == "subscribed":
            self._run_catch_up()
        elif kind == "error":
            self.error.emit(str(payload.get("message") or payload.get("code") or "Realtime error"))

    def _run_catch_up(self) -> None:
        for channel in self._channels:
            after_id = self._last_ids.get(channel)
            if not after_id:
                continue
            try:
                events = _fetch_catch_up(
                    self._client,
                    self._rest_base,
                    self._catch_up_path,
                    channel,
                    after_id,
                )
            except Exception as exc:
                logger.debug("Realtime catch-up failed for %s: %s", channel, exc)
                self.error.emit(str(exc))
                continue
            for event in events:
                event_id = _event_id(event)
                if event_id:
                    self._last_ids[channel] = event_id
                self.event_received.emit(
                    {"channel": channel, "event": event, "catchUp": True}
                )

    def _ping(self) -> None:
        if self._socket is not None:
            self._socket.ping()

    def _send(self, payload: dict[str, Any]) -> None:
        if self._socket is not None:
            self._socket.sendTextMessage(json.dumps(payload))

    def _schedule_reconnect(self) -> None:
        if not self._running:
            return
        delay = min(_RECONNECT_CAP_SECONDS, 2.0**min(self._attempt, 5))
        self._attempt += 1
        self._reconnect.start(int(delay * 1000))


class RealtimeClient(QObject):
    connected = Signal()
    disconnected = Signal()
    event_received = Signal(dict)
    data_changed = Signal(str)
    error = Signal(str)
    channels_requested = Signal(list)

    def __init__(
        self,
        client: ApiClient,
        channels: Sequence[str],
        parent: QObject | None = None,
        rest_base: str | None = None,
        ticket_path: str = "tickets",
        catch_up_path: str = "events/catch-up",
        connect_path: str = DEFAULT_CONNECT_PATH,
    ) -> None:
        super().__init__(parent)
        self._channels = list(channels)
        self._thread = QThread(self)
        self._worker = _RealtimeWorker(
            client,
            self._channels,
            rest_base or f"{client.config.gateway_url.rstrip('/')}{DEFAULT_REST_PATH}",
            ticket_path,
            catch_up_path,
            connect_path,
        )
        self._worker.moveToThread(self._thread)
        self._thread.started.connect(self._worker.start)
        self._worker.stopped.connect(self._thread.quit)
        self._worker.connected.connect(self.connected)
        self._worker.disconnected.connect(self.disconnected)
        self._worker.event_received.connect(self._on_event)
        self._worker.error.connect(self.error)
        self.channels_requested.connect(self._worker.update_channels)

    @property
    def channels(self) -> list[str]:
        return list(self._channels)

    @Slot()
    def start(self) -> None:
        if self._thread.isRunning() or not self._channels:
            return
        self._thread.start()

    @Slot()
    def stop(self) -> None:
        if not self._thread.isRunning():
            return
        QMetaObject.invokeMethod(
            self._worker, "stop", Qt.ConnectionType.BlockingQueuedConnection
        )
        self._thread.quit()
        self._thread.wait(3000)

    def set_channels(self, channels: Sequence[str]) -> None:
        self._channels = list(channels)
        self.channels_requested.emit(self._channels)

    @Slot(dict)
    def _on_event(self, payload: dict[str, Any]) -> None:
        self.event_received.emit(payload)
        self.data_changed.emit(str(payload.get("channel") or ""))


class DataChangedIndicator(QWidget):
    refresh_requested = Signal()

    def __init__(self, translator: Translator, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self._translator = translator
        self._connected = False
        self._changed = False
        self._unavailable = False
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(6)
        self.label = QLabel()
        self.label.setObjectName("Muted")
        self.refresh_button = QPushButton()
        self.refresh_button.setObjectName("Ghost")
        self.refresh_button.setVisible(False)
        self.refresh_button.clicked.connect(self.refresh_requested.emit)
        layout.addWidget(self.label)
        layout.addWidget(self.refresh_button)
        translator.language_changed.connect(self._apply_text)
        self._apply_text()

    @Slot(bool)
    def set_connected(self, connected: bool) -> None:
        self._connected = bool(connected)
        self._unavailable = False
        self._apply_text()

    @Slot()
    def set_unavailable(self) -> None:
        self._unavailable = True
        self._connected = False
        self._apply_text()

    @Slot(str)
    def mark_data_changed(self, _channel: str = "") -> None:
        self._changed = True
        self._apply_text()

    @Slot()
    def clear(self) -> None:
        self._changed = False
        self._apply_text()

    def _apply_text(self, *_args: Any) -> None:
        if self._changed:
            self.label.setText(self._translator.tr("status.data_changed"))
        elif self._unavailable:
            self.label.setText(self._translator.tr("status.live_unavailable"))
        elif self._connected:
            self.label.setText(self._translator.tr("status.live_connected"))
        else:
            self.label.setText(self._translator.tr("status.live_disconnected"))
        self.refresh_button.setText(self._translator.tr("action.refresh"))
        self.refresh_button.setVisible(self._changed)
