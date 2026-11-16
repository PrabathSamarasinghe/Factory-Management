"""Authentication audit log viewer."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import ApiError, SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    PageHeader,
    StatusBanner,
    format_bool,
    format_datetime,
    ghost_button,
    run_async,
)
from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QComboBox,
    QDialog,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QVBoxLayout,
    QWidget,
)


class AuditDetailDialog(QDialog):
    def __init__(self, event: dict[str, Any], parent: QWidget | None = None):
        super().__init__(parent)
        self.setWindowTitle("Audit event")
        self.setMinimumWidth(520)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 24, 24, 24)

        user = event.get("user") or {}
        form = QFormLayout()
        form.setHorizontalSpacing(20)
        form.setVerticalSpacing(8)
        fields = [
            ("Event", event.get("event")),
            ("When", format_datetime(event.get("at"))),
            ("Result", format_bool(event.get("success"), yes="Success", no="Failed")),
            ("User", user.get("username") or "-"),
            ("Email", user.get("email") or "-"),
            ("User ID", event.get("userId") or "-"),
            ("IP", event.get("ip") or "-"),
            ("Device ID", event.get("deviceId") or "-"),
            ("Event ID", event.get("id") or "-"),
        ]
        for label, value in fields:
            field = QLabel("" if value is None else str(value))
            field.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
            field.setWordWrap(True)
            form.addRow(label, field)
        layout.addLayout(form)

        close = ghost_button("Close")
        close.clicked.connect(self.accept)
        row = QHBoxLayout()
        row.addStretch(1)
        row.addWidget(close)
        layout.addLayout(row)


class AuditPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session
        self._page = 1
        self._total_pages = 1
        self._events_loaded = False

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(14)

        header = PageHeader(
            "Audit Log",
            "Authentication events recorded by the identity service.",
        )
        refresh = ghost_button("Refresh")
        refresh.clicked.connect(self._reset_and_refresh)
        header.add_action(refresh)
        layout.addWidget(header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        filters = QHBoxLayout()
        filters.setSpacing(8)
        self.event_combo = QComboBox()
        self.event_combo.setEditable(True)
        self.event_combo.addItem("Any event", None)
        self.event_combo.currentIndexChanged.connect(self._reset_and_refresh)
        self.user_input = QLineEdit()
        self.user_input.setPlaceholderText("User ID")
        self.user_input.setClearButtonEnabled(True)
        self.user_input.returnPressed.connect(self._reset_and_refresh)
        self.success_combo = QComboBox()
        self.success_combo.addItem("Any result", None)
        self.success_combo.addItem("Success", True)
        self.success_combo.addItem("Failure", False)
        self.success_combo.currentIndexChanged.connect(self._reset_and_refresh)
        self.from_input = QLineEdit()
        self.from_input.setPlaceholderText("From YYYY-MM-DD")
        self.from_input.returnPressed.connect(self._reset_and_refresh)
        self.to_input = QLineEdit()
        self.to_input.setPlaceholderText("To YYYY-MM-DD")
        self.to_input.returnPressed.connect(self._reset_and_refresh)

        filters.addWidget(self.event_combo, 2)
        filters.addWidget(self.user_input, 2)
        filters.addWidget(self.success_combo)
        filters.addWidget(self.from_input)
        filters.addWidget(self.to_input)
        layout.addLayout(filters)

        self.table = DataTable(
            [
                ("at_text", "When", 150),
                ("event", "Event", 260),
                ("result", "Result", 90),
                ("username", "User", 150),
                ("userId", "User ID", 280),
                ("ip", "IP", 120),
            ]
        )
        self.table.itemDoubleClicked.connect(lambda _item: self._show_details())
        layout.addWidget(self.table, 1)

        footer = QHBoxLayout()
        self.page_label = QLabel("Page 1 of 1")
        self.page_label.setObjectName("Muted")
        self.prev_button = ghost_button("Previous")
        self.prev_button.clicked.connect(self._prev_page)
        self.next_button = ghost_button("Next")
        self.next_button.clicked.connect(self._next_page)
        footer.addWidget(self.page_label)
        footer.addStretch(1)
        footer.addWidget(self.prev_button)
        footer.addWidget(self.next_button)
        layout.addLayout(footer)

    # ------------------------------------------------------------------ data
    def _reset_and_refresh(self) -> None:
        self._page = 1
        self.refresh()

    def refresh(self) -> None:
        self.banner.clear()
        event = self.event_combo.currentData()
        if event is None:
            text = self.event_combo.currentText().strip()
            event = text if text and text != "Any event" else None
        user_id = self.user_input.text().strip() or None
        success = self.success_combo.currentData()
        date_from = self.from_input.text().strip() or None
        date_to = self.to_input.text().strip() or None
        if date_to and len(date_to) == 10:
            date_to = f"{date_to}T23:59:59"
        page = self._page

        run_async(
            lambda: self._load(event, user_id, success, date_from, date_to, page),
            self._apply,
            self._on_error,
        )

    def _load(
        self,
        event: str | None,
        user_id: str | None,
        success: bool | None,
        date_from: str | None,
        date_to: str | None,
        page: int,
    ) -> dict[str, Any]:
        result: dict[str, Any] = {}
        result["logs"] = (
            self.session.identity.list_audit_logs(
                event=event,
                user_id=user_id,
                success=success,
                date_from=date_from,
                date_to=date_to,
                page=page,
                limit=50,
            )
            or {}
        )
        if not self._events_loaded:
            try:
                result["events"] = self.session.identity.list_audit_events() or []
            except ApiError:
                result["events"] = []
        return result

    def _apply(self, data: dict[str, Any]) -> None:
        if "events" in data:
            self._events_loaded = True
            existing = {
                self.event_combo.itemData(index)
                for index in range(self.event_combo.count())
            }
            for event in data["events"]:
                if event not in existing:
                    self.event_combo.addItem(str(event), str(event))

        logs = data.get("logs") or {}
        page_info = logs.get("page") or {}
        self._page = int(page_info.get("current") or 1)
        self._total_pages = max(int(page_info.get("totalPages") or 1), 1)

        rows = []
        for event in logs.get("data") or []:
            user = event.get("user") or {}
            rows.append(
                {
                    **event,
                    "at_text": format_datetime(event.get("at")),
                    "result": format_bool(
                        event.get("success"), yes="Success", no="Failed"
                    ),
                    "username": user.get("username") or "-",
                }
            )
        self.table.set_rows(rows)

        self.page_label.setText(
            f"Page {self._page} of {self._total_pages} "
            f"({page_info.get('total', len(rows))} events)"
        )
        self.prev_button.setEnabled(self._page > 1)
        self.next_button.setEnabled(self._page < self._total_pages)

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))

    # --------------------------------------------------------------- actions
    def _show_details(self) -> None:
        event = self.table.selected_row()
        if not event:
            return
        AuditDetailDialog(event, self).exec()

    def _prev_page(self) -> None:
        if self._page > 1:
            self._page -= 1
            self.refresh()

    def _next_page(self) -> None:
        if self._page < self._total_pages:
            self._page += 1
            self.refresh()
