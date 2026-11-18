"""SMS delivery status, retry control and dead-letter review for C4."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    PageHeader,
    StatusBanner,
    confirm,
    format_datetime,
    ghost_button,
    primary_button,
    run_async,
    title_case,
)
from PySide6.QtCore import QTimer
from PySide6.QtWidgets import (
    QComboBox,
    QFrame,
    QHBoxLayout,
    QLabel,
    QVBoxLayout,
    QWidget,
)


class SmsPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session
        self._loading = False
        self._timer = QTimer(self)
        self._timer.setInterval(15000)
        self._timer.timeout.connect(self.refresh)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(14)

        header = PageHeader(
            "Supplier SMS",
            "Live delivery status from the notification service. Refreshes every 15 seconds.",
        )
        self.refresh_button = ghost_button("Refresh")
        self.refresh_button.clicked.connect(self.refresh)
        header.add_action(self.refresh_button)
        layout.addWidget(header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        filters = QHBoxLayout()
        filters.setSpacing(10)
        filters.addWidget(QLabel("Status"))
        self.status_combo = QComboBox()
        for label, value in (
            ("All", None),
            ("Queued", "QUEUED"),
            ("Sent", "SENT"),
            ("Delivered", "DELIVERED"),
            ("Failed", "FAILED"),
        ):
            self.status_combo.addItem(label, value)
        self.status_combo.currentIndexChanged.connect(self.refresh)
        filters.addWidget(self.status_combo)
        filters.addStretch(1)
        layout.addLayout(filters)

        messages_frame = QFrame()
        messages_frame.setObjectName("Panel")
        messages_layout = QVBoxLayout(messages_frame)
        messages_layout.setContentsMargins(18, 16, 18, 16)
        messages_layout.setSpacing(10)
        messages_title = QLabel("Delivery status")
        messages_title.setObjectName("PageTitle")
        messages_title.setStyleSheet("font-size: 12pt;")
        messages_layout.addWidget(messages_title)

        self.table = DataTable(
            [
                ("id", "Message", 190),
                ("recipientMasked", "Recipient", 150),
                ("relatedId", "Daily total", 190),
                ("status", "Status", 110),
                ("attempts", "Attempts", 90),
                ("providerMessageId", "Provider ref", 160),
                ("lastError", "Last error", 260),
                ("queuedAt", "Queued", 170),
                ("sentAt", "Sent", 170),
                ("deliveredAt", "Delivered", 170),
            ]
        )
        for key in ("status",):
            self.table.set_formatter(key, lambda value, _row: title_case(value))
        for key in ("queuedAt", "sentAt", "deliveredAt"):
            self.table.set_formatter(key, lambda value, _row: format_datetime(value))
        self.table.itemSelectionChanged.connect(self._update_actions)
        messages_layout.addWidget(self.table, 1)

        actions = QHBoxLayout()
        self.resend_button = primary_button("Resend selected")
        self.resend_button.clicked.connect(self.resend)
        actions.addWidget(self.resend_button)
        actions.addStretch(1)
        messages_layout.addLayout(actions)
        layout.addWidget(messages_frame, 2)

        dead_letter_frame = QFrame()
        dead_letter_frame.setObjectName("Panel")
        dead_letter_layout = QVBoxLayout(dead_letter_frame)
        dead_letter_layout.setContentsMargins(18, 16, 18, 16)
        dead_letter_layout.setSpacing(10)
        dead_letter_title = QLabel("Dead letter queue")
        dead_letter_title.setObjectName("PageTitle")
        dead_letter_title.setStyleSheet("font-size: 12pt;")
        dead_letter_layout.addWidget(dead_letter_title)

        self.dead_letter_table = DataTable(
            [
                ("id", "Entry", 190),
                ("messageId", "Message", 190),
                ("attempts", "Attempts", 90),
                ("reason", "Reason", 400),
                ("createdAt", "Created", 170),
            ]
        )
        self.dead_letter_table.set_formatter(
            "createdAt", lambda value, _row: format_datetime(value)
        )
        dead_letter_layout.addWidget(self.dead_letter_table, 1)

        dead_letter_actions = QHBoxLayout()
        self.replay_button = primary_button("Replay selected")
        self.replay_button.clicked.connect(self.replay_dead_letter)
        dead_letter_actions.addWidget(self.replay_button)
        dead_letter_actions.addStretch(1)
        dead_letter_layout.addLayout(dead_letter_actions)
        layout.addWidget(dead_letter_frame, 1)

        self.resend_button.setEnabled(self.session.has_permission("sms:resend"))
        self.replay_button.setEnabled(self.session.has_permission("sms:resend"))

    def showEvent(self, event) -> None:
        super().showEvent(event)
        self._timer.start()

    def hideEvent(self, event) -> None:
        self._timer.stop()
        super().hideEvent(event)

    def refresh(self) -> None:
        self.banner.clear()
        if not self.session.has_permission("sms:read"):
            self.banner.show_error("Your role cannot view SMS delivery status.")
            return
        if self._loading:
            return
        self._loading = True
        run_async(self._load, self._apply, self._on_error)

    def _load(self) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        messages = self.session.notification.list_messages(
            status=self.status_combo.currentData()
        )
        dead_letters = (
            self.session.notification.list_dead_letters()
            if self.session.has_permission("sms:review")
            else []
        )
        return messages or [], dead_letters or []

    def _apply(
        self, result: tuple[list[dict[str, Any]], list[dict[str, Any]]]
    ) -> None:
        self._loading = False
        messages, dead_letters = result
        self.table.set_rows(messages)
        self.dead_letter_table.set_rows(dead_letters)
        self.banner.show_info(f"{len(messages)} SMS record(s); {len(dead_letters)} dead letter(s).")
        self._update_actions()

    def _update_actions(self) -> None:
        selected = self.table.selected_row() or {}
        self.resend_button.setEnabled(
            self.session.has_permission("sms:resend") and selected.get("status") == "FAILED"
        )
        self.replay_button.setEnabled(
            self.session.has_permission("sms:resend")
            and self.dead_letter_table.selected_row() is not None
        )

    def resend(self) -> None:
        selected = self.table.selected_row()
        if not selected:
            self.banner.show_info("Select a failed message first.")
            return
        if not confirm(self, "Resend SMS", "Resend the selected supplier SMS?"):
            return
        message_id = str(selected.get("id") or "")
        run_async(
            lambda: self.session.notification.resend(message_id),
            lambda _result: self.refresh(),
            self._on_error,
        )

    def replay_dead_letter(self) -> None:
        selected = self.dead_letter_table.selected_row()
        if not selected:
            self.banner.show_info("Select a dead-letter entry first.")
            return
        if not confirm(self, "Replay SMS", "Replay the selected dead-letter entry?"):
            return
        entry_id = str(selected.get("id") or "")
        run_async(
            lambda: self.session.notification.replay_dead_letter(entry_id),
            lambda _result: self.refresh(),
            self._on_error,
        )

    def _on_error(self, error: BaseException) -> None:
        self._loading = False
        self.banner.show_error(human_error(error))
