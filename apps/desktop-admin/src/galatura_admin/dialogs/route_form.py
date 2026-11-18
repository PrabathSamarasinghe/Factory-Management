"""Create and edit route dialogs."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core.widgets import FormDialog
from PySide6.QtWidgets import QComboBox, QLineEdit, QTextEdit, QWidget

ROUTE_STATUSES = ["ACTIVE", "INACTIVE"]


class RouteFormDialog(FormDialog):
    def __init__(self, route: dict[str, Any] | None = None, parent: QWidget | None = None):
        self.route = route
        super().__init__("Edit route" if route else "New route", parent)

        self.code_input = QLineEdit()
        self.code_input.setPlaceholderText("e.g. R01")
        self.name_input = QLineEdit()
        self.description_input = QTextEdit()
        self.description_input.setFixedHeight(70)
        self.distance_input = QLineEdit()
        self.distance_input.setPlaceholderText("km")
        self.status_combo = QComboBox()
        for status in ROUTE_STATUSES:
            self.status_combo.addItem(status.title(), status)

        self.add_row("Code *", self.code_input)
        self.add_row("Name *", self.name_input)
        self.add_row("Description", self.description_input)
        self.add_row("Estimated distance (km)", self.distance_input)
        self.add_row("Status", self.status_combo)
        self._populate()

    def _populate(self) -> None:
        if not self.route:
            return
        self.code_input.setText(str(self.route.get("code") or ""))
        self.name_input.setText(str(self.route.get("name") or ""))
        self.description_input.setPlainText(str(self.route.get("description") or ""))
        distance = self.route.get("estimatedDistanceKm")
        self.distance_input.setText("" if distance is None else str(distance))
        index = self.status_combo.findData(self.route.get("status") or "ACTIVE")
        if index >= 0:
            self.status_combo.setCurrentIndex(index)

    def validate(self) -> str | None:
        if not self.code_input.text().strip() or not self.name_input.text().strip():
            return "Code and name are required."
        distance = self.distance_input.text().strip()
        if distance:
            try:
                if float(distance) < 0:
                    raise ValueError
            except ValueError:
                return "Estimated distance must be a non-negative number."
        return None

    def collect(self) -> dict[str, Any]:
        return {
            "code": self.code_input.text().strip(),
            "name": self.name_input.text().strip(),
            "description": _optional(self.description_input.toPlainText()),
            "estimatedDistanceKm": _optional(self.distance_input.text()),
            "status": self.status_combo.currentData(),
        }


def _optional(value: str) -> str | None:
    text = value.strip()
    return text or None
