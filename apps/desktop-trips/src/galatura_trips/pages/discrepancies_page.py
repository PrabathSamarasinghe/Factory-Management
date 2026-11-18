"""Review and resolve factory-versus-field weight discrepancies."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    FormDialog,
    PageHeader,
    StatusBanner,
    format_datetime,
    ghost_button,
    primary_button,
    run_async,
    title_case,
)
from PySide6.QtWidgets import (
    QComboBox,
    QHBoxLayout,
    QLabel,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)


class ResolveDialog(FormDialog):
    def __init__(self, discrepancy: dict[str, Any], parent: QWidget | None = None):
        super().__init__("Resolve discrepancy", parent)
        self.status_combo = QComboBox()
        for label, value in (
            ("Resolved", "RESOLVED"),
            ("Accepted", "ACCEPTED"),
            ("Disputed", "DISPUTED"),
            ("Reopen", "OPEN"),
        ):
            self.status_combo.addItem(label, value)
        self.note_input = QTextEdit()
        self.note_input.setMinimumHeight(100)
        self.note_input.setPlainText(str(discrepancy.get("note") or ""))
        self.add_row("Status", self.status_combo)
        self.add_row("Note", self.note_input)

    def validate(self) -> str | None:
        if (
            self.status_combo.currentData() == "RESOLVED"
            and not self.note_input.toPlainText().strip()
        ):
            return "Enter a note explaining the resolution."
        return None

    def collect(self) -> dict[str, Any]:
        return {
            "status": self.status_combo.currentData(),
            "note": self.note_input.toPlainText().strip() or None,
        }


class DiscrepanciesPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(14)

        header = PageHeader(
            "Discrepancies",
            "Investigate weight differences over the configured tolerance.",
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
            ("Open", "OPEN"),
            ("Accepted", "ACCEPTED"),
            ("Disputed", "DISPUTED"),
            ("Resolved", "RESOLVED"),
            ("All", None),
        ):
            self.status_combo.addItem(label, value)
        self.status_combo.currentIndexChanged.connect(self.refresh)
        filters.addWidget(self.status_combo)
        filters.addStretch(1)
        layout.addLayout(filters)

        self.table = DataTable(
            [
                ("id", "ID", 240),
                ("fieldKg", "Field kg", 110),
                ("factoryKg", "Factory kg", 110),
                ("diffKg", "Diff kg", 100),
                ("diffPct", "Diff %", 90),
                ("status", "Status", 110),
                ("note", "Note", 280),
                ("updatedAt", "Updated", 160),
            ]
        )
        self.table.set_formatter("status", lambda value, _row: title_case(value))
        self.table.set_formatter("updatedAt", lambda value, _row: format_datetime(value))
        layout.addWidget(self.table, 1)

        actions = QHBoxLayout()
        self.resolve_button = primary_button("Resolve selected")
        self.resolve_button.clicked.connect(self.resolve)
        actions.addWidget(self.resolve_button)
        actions.addStretch(1)
        layout.addLayout(actions)

        self.resolve_button.setEnabled(self.session.has_permission("collection:resolve"))

    def refresh(self) -> None:
        self.banner.clear()
        if not self.session.has_permission("collection:review"):
            self.banner.show_error("Your role cannot review collection discrepancies.")
            return
        status = self.status_combo.currentData()
        run_async(
            lambda: self.session.collection.list_discrepancies(status),
            self._apply,
            self._on_error,
        )

    def _apply(self, rows: list[dict[str, Any]]) -> None:
        self.table.set_rows(rows or [])
        self.banner.show_info(f"{len(rows or [])} discrepancy record(s).")

    def resolve(self) -> None:
        if not self.session.has_permission("collection:resolve"):
            self.banner.show_error("Your role cannot resolve discrepancies.")
            return
        row = self.table.selected_row()
        if not row:
            self.banner.show_info("Select a discrepancy first.")
            return
        dialog = ResolveDialog(row, self)
        if not dialog.exec():
            return
        payload = dialog.payload
        discrepancy_id = str(row.get("id") or "")
        run_async(
            lambda: self.session.collection.resolve_discrepancy(
                discrepancy_id,
                payload["status"],
                payload["note"],
            ),
            lambda _result: self.refresh(),
            self._on_error,
        )

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))
