"""Fleet expiry and maintenance alerts dialog."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core.widgets import DataTable, format_date, title_case
from PySide6.QtWidgets import QDialog, QVBoxLayout, QWidget


class FleetAlertsDialog(QDialog):
    def __init__(self, alerts: list[dict[str, Any]], parent: QWidget | None = None):
        super().__init__(parent)
        self.setWindowTitle("Fleet alerts")
        self.setModal(True)
        self.resize(820, 480)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 18, 18, 18)
        self.table = DataTable(
            [
                ("registrationNo", "Registration", 150),
                ("kind", "Alert", 170),
                ("severity", "Severity", 120),
                ("dueDate", "Due", 120),
                ("message", "Details", 320),
            ]
        )
        self.table.set_formatter("kind", lambda value, _row: title_case(value))
        self.table.set_formatter("severity", lambda value, _row: title_case(value))
        self.table.set_formatter(
            "dueDate", lambda value, _row: format_date(value) if value else "-"
        )
        layout.addWidget(self.table, 1)
        self.table.set_rows(alerts)
