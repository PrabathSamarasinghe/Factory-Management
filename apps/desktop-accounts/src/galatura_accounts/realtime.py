"""Local realtime client for the accounts.updates channel."""

from __future__ import annotations

import base64
import json
import logging
import os
import socket
import ssl
import threading
from typing import Any
from urllib.parse import quote, urlparse

from PySide6.QtCore import QObject, QThread, Signal

logger = logging.getLogger(__name__)

CHANNEL = "accounts.updates"
POLL_SECONDS = 5.0
SOCKET_TIMEOUT = 1.0


class _UpdatesWorker(QThread):
    changed = Signal(object)
    status = Signal(str)

    def __init__(self, session: Any, channel: str = CHANNEL) -> None:
        super().__init__()
        self.session = session
        self.channel = channel
        self._stop = threading.Event()
        self._last_id = 0
        self._initialized = False
        self._base = f"{session.config.gateway_url.rstrip('/')}/api/v1/realtime"

    def stop(self) -> None:
        self._stop.set()

    def run(self) -> None:
        websocket_url = ""
        try:
            ticket = self._ticket()
            if ticket:
                websocket_url = self._websocket_url(ticket)
        except Exception as exc:
            logger.debug("Could not request a realtime ticket: %s", exc)
        if websocket_url:
            try:
                self._serve_websocket(websocket_url)
            except Exception as exc:
                logger.debug("Realtime websocket unavailable: %s", exc)
        if not self._stop.is_set():
            self.status.emit(f"Live: {self.channel} (polling)")
        attempts = 0
        while not self._stop.is_set():
            if attempts and attempts % 12 == 0:
                try:
                    ticket = self._ticket()
                    if ticket:
                        self._serve_websocket(self._websocket_url(ticket))
                except Exception as exc:
                    logger.debug("Realtime websocket reconnect failed: %s", exc)
            if self._stop.is_set():
                break
            try:
                self._poll_once()
            except Exception as exc:
                self.status.emit(f"Realtime unavailable: {exc}")
            attempts += 1
            self._stop.wait(POLL_SECONDS)

    def _ticket(self) -> str:
        response = self.session.client.post(
            self._base,
            "/tickets",
            json_body={"channels": [self.channel]},
        )
        if isinstance(response, str):
            return response
        if isinstance(response, dict):
            ticket = response.get("ticket") or response.get("data")
            if isinstance(ticket, dict):
                ticket = ticket.get("ticket")
            if ticket:
                return str(ticket)
        return ""

    def _websocket_url(self, ticket: str) -> str:
        base = self._base
        if base.startswith("https://"):
            base = "wss://" + base[len("https://") :]
        elif base.startswith("http://"):
            base = "ws://" + base[len("http://") :]
        return f"{base}/connect?ticket={quote(ticket, safe='')}"

    def _serve_websocket(self, url: str) -> None:
        parsed = urlparse(url)
        scheme = parsed.scheme.lower()
        if scheme not in {"ws", "wss"}:
            return
        host = parsed.hostname or ""
        port = parsed.port or (443 if scheme == "wss" else 80)
        path = parsed.path or "/"
        if parsed.query:
            path = f"{path}?{parsed.query}"
        plain = socket.create_connection((host, port), timeout=SOCKET_TIMEOUT)
        sock: socket.socket = (
            ssl.create_default_context().wrap_socket(plain, server_hostname=host)
            if scheme == "wss"
            else plain
        )
        try:
            self._handshake(sock, host, port, path)
            subscribe = json.dumps({"type": "subscribe", "channels": [self.channel]})
            sock.sendall(self._frame(subscribe))
            self.status.emit(f"Live: {self.channel} (websocket)")
            sock.settimeout(SOCKET_TIMEOUT)
            while not self._stop.is_set():
                try:
                    message = self._read_frame(sock)
                except socket.timeout:
                    continue
                if not message:
                    continue
                payload = json.loads(message)
                if not isinstance(payload, dict):
                    continue
                if payload.get("channel") and payload.get("channel") != self.channel:
                    continue
                kind = str(payload.get("type") or payload.get("eventType") or "").lower()
                if kind in {"subscribe", "subscribed", "ack", "ping", "pong"}:
                    continue
                event_id = payload.get("id")
                if isinstance(event_id, int):
                    self._last_id = max(self._last_id, event_id)
                self._initialized = True
                self.changed.emit(payload)
        finally:
            sock.close()

    @staticmethod
    def _handshake(sock: socket.socket, host: str, port: int, path: str) -> None:
        key = base64.b64encode(os.urandom(16)).decode("ascii")
        request = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            "Upgrade: websocket\r\n"
            "Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            "Sec-WebSocket-Version: 13\r\n"
            "\r\n"
        )
        sock.sendall(request.encode("ascii"))
        response = bytearray()
        while b"\r\n\r\n" not in response:
            chunk = sock.recv(4096)
            if not chunk or len(response) > 65536:
                raise ConnectionError("Websocket upgrade failed.")
            response.extend(chunk)
        headers = bytes(response).split(b"\r\n\r\n", 1)[0].decode("latin-1")
        if " 101 " not in headers.split("\r\n", 1)[0]:
            raise ConnectionError("Websocket upgrade was rejected.")

    @staticmethod
    def _frame(text: str) -> bytes:
        payload = text.encode("utf-8")
        mask = os.urandom(4)
        length = len(payload)
        if length < 126:
            header = bytes((0x81, 0x80 | length))
        elif length < 65536:
            header = bytes((0x81, 0xFE)) + length.to_bytes(2, "big")
        else:
            header = bytes((0x81, 0xFF)) + length.to_bytes(8, "big")
        masked = bytes(byte ^ mask[index % 4] for index, byte in enumerate(payload))
        return header + mask + masked

    @staticmethod
    def _recv_exact(sock: socket.socket, count: int) -> bytes:
        data = bytearray()
        while len(data) < count:
            chunk = sock.recv(count - len(data))
            if not chunk:
                raise ConnectionError("Websocket closed.")
            data.extend(chunk)
        return bytes(data)

    def _read_frame(self, sock: socket.socket) -> str:
        first, second = self._recv_exact(sock, 2)
        opcode = first & 0x0F
        length = second & 0x7F
        if length == 126:
            length = int.from_bytes(self._recv_exact(sock, 2), "big")
        elif length == 127:
            length = int.from_bytes(self._recv_exact(sock, 8), "big")
        if second & 0x80:
            mask = self._recv_exact(sock, 4)
            data = bytes(
                byte ^ mask[index % 4]
                for index, byte in enumerate(self._recv_exact(sock, length))
            )
        else:
            data = self._recv_exact(sock, length)
        if opcode == 0x8:
            raise ConnectionError("Websocket closed.")
        if opcode != 0x1:
            return ""
        return data.decode("utf-8", errors="replace")

    def _poll_once(self) -> None:
        response = self.session.client.get(
            self._base,
            "/catch-up",
            params={"channel": self.channel, "afterId": self._last_id},
        )
        events = response if isinstance(response, list) else []
        if isinstance(response, dict):
            candidate = response.get("events") or response.get("data")
            if isinstance(candidate, list):
                events = candidate
        event_ids = [
            int(event["id"])
            for event in events
            if isinstance(event, dict) and str(event.get("id") or "").isdigit()
        ]
        if self._initialized and events:
            for event in events:
                self.changed.emit(event)
        if event_ids:
            self._last_id = max(self._last_id, max(event_ids))
        self._initialized = True


class AccountsUpdatesClient(QObject):
    data_changed = Signal(object)
    status_changed = Signal(str)

    def __init__(self, session: Any, parent: QObject | None = None) -> None:
        super().__init__(parent)
        self._worker = _UpdatesWorker(session)
        self._worker.changed.connect(self.data_changed)
        self._worker.status.connect(self.status_changed)

    def start(self) -> None:
        if not self._worker.isRunning():
            self._worker.start()

    def stop(self) -> None:
        self._worker.stop()
        self._worker.wait(3000)
