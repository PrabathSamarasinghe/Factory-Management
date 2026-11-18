"""Create and change lorry assignment dialogs."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from galatura_desktop_core.widgets import FormDialog
from PySide6.QtWidgets import QCheckBox, QComboBox, QHBoxLayout, QLineEdit, QWidget

WEEKDAYS = [
    (1, "Mon"),
    (2, "Tue"),
    (3, "Wed"),
    (4, "Thu"),
    (5, "Fri"),
    (6, "Sat"),
    (7, "Sun"),
]


def _date_ok(value: str) -> bool:
    if not value:
        return True
    try:
        datetime.strptime(value, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def _date_text(value: Any) -> str:
    return str(value or "")[:10]


def _optional(value: str) -> str | None:
    text = value.strip()
    return text or None


class AssignmentFormDialog(FormDialog):
    def __init__(
        self,
        routes: list[dict[str, Any]],
        lorries: list[dict[str, Any]],
        assignment: dict[str, Any] | None = None,
        parent: QWidget | None = None,
    ):
        self.assignment = assignment
        self.is_change = assignment is not None
        super().__init__("Change assignment" if self.is_change else "New assignment", parent)

        self.route_combo = QComboBox()
        self.lorry_combo = QComboBox()
        self._populate_combo(self.route_combo, routes, "code", "name")
        self._populate_combo(self.lorry_combo, lorries, "registrationNo", "make")
        self.driver_input = QLineEdit()
        self.helper_input = QLineEdit()
        self.supervisor_input = QLineEdit()
        self.effective_from = QLineEdit()
        self.effective_from.setPlaceholderText("YYYY-MM-DD")
        self.effective_to = QLineEdit()
        self.effective_to.setPlaceholderText("YYYY-MM-DD")
        self.change_reason = QLineEdit()
        self.change_reason.setPlaceholderText("Required when changing an assignment")

        self.add_row("Route *", self.route_combo)
        self.add_row("Lorry *", self.lorry_combo)
        self.add_row("Driver person ID", self.driver_input)
        self.add_row("Helper person ID", self.helper_input)
        self.add_row("Supervisor person ID", self.supervisor_input)
        self.add_row("Effective from *", self.effective_from)
        self.add_row("Effective to", self.effective_to)
        self.add_row("Active weekdays", self._weekday_widget())
        if self.is_change:
            self.add_row("Change reason *", self.change_reason)
        self._populate()

    def _populate_combo(
        self,
        combo: QComboBox,
        rows: list[dict[str, Any]],
        primary: str,
        secondary: str,
    ) -> None:
        for row in rows:
            label = f"{row.get(primary) or '-'} - {row.get(secondary) or ''}".strip(" -")
            combo.addItem(label, row.get("id"))

    def _weekday_widget(self) -> QWidget:
        container = QWidget()
        layout = QHBoxLayout(container)
        layout.setContentsMargins(0, 0, 0, 0)
        self.weekday_checks: dict[int, QCheckBox] = {}
        for day, label in WEEKDAYS:
            checkbox = QCheckBox(label)
            self.weekday_checks[day] = checkbox
            layout.addWidget(checkbox)
        return container

    def _populate(self) -> None:
        if not self.assignment:
            return
        for combo, key in (
            (self.route_combo, "routeId"),
            (self.lorry_combo, "lorryId"),
        ):
            value = self.assignment.get(key)
            index = combo.findData(value)
            if index < 0 and value:
                combo.addItem(str(value), value)
                index = combo.findData(value)
            if index >= 0:
                combo.setCurrentIndex(index)
        self.driver_input.setText(str(self.assignment.get("driverId") or ""))
        self.helper_input.setText(str(self.assignment.get("helperId") or ""))
        self.supervisor_input.setText(str(self.assignment.get("supervisorId") or ""))
        self.effective_from.setText(_date_text(self.assignment.get("effectiveFrom")))
        self.effective_to.setText(_date_text(self.assignment.get("effectiveTo")))
        selected = {int(day) for day in (self.assignment.get("weekdays") or [])}
        for day, checkbox in self.weekday_checks.items():
            checkbox.setChecked(day in selected or not selected)

    def validate(self) -> str | None:
        if not self.route_combo.currentData() or not self.lorry_combo.currentData():
            return "Select a route and lorry."
        if not _date_ok(self.effective_from.text().strip()):
            return "Effective from must be YYYY-MM-DD."
        if not _date_ok(self.effective_to.text().strip()):
            return "Effective to must be YYYY-MM-DD or blank."
        if (
            self.effective_to.text().strip()
            and self.effective_to.text().strip() < self.effective_from.text().strip()
        ):
            return "Effective to cannot be before effective from."
        if self.is_change and not self.change_reason.text().strip():
            return "Change reason is required."
        return None

    def collect(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "routeId": self.route_combo.currentData(),
            "lorryId": self.lorry_combo.currentData(),
            "driverId": _optional(self.driver_input.text()),
            "helperId": _optional(self.helper_input.text()),
            "supervisorId": _optional(self.supervisor_input.text()),
            "effectiveFrom": self.effective_from.text().strip(),
            "effectiveTo": _optional(self.effective_to.text()),
            "weekdays": [day for day, box in self.weekday_checks.items() if box.isChecked()],
        }
        if self.is_change:
            payload["changeReason"] = self.change_reason.text().strip()
        return payload
