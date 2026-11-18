"""Lorry assignment registry and change-history page."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from galatura_desktop_core import SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    PageHeader,
    StatusBanner,
    format_date,
    ghost_button,
    primary_button,
    run_async,
    title_case,
)
from PySide6.QtWidgets import (
    QComboBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QVBoxLayout,
    QWidget,
)

from ..dialogs.assignment_form import AssignmentFormDialog


class AssignmentsPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session
        self.routes: list[dict[str, Any]] = []
        self.lorries: list[dict[str, Any]] = []

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(16)

        header = PageHeader(
            "Assignments",
            "Assign lorries to routes and record effective-dated changes.",
        )
        self.refresh_button = ghost_button("Refresh")
        self.refresh_button.clicked.connect(self.refresh)
        self.new_button = primary_button("New assignment")
        self.new_button.clicked.connect(self.create_assignment)
        header.add_action(self.refresh_button)
        header.add_action(self.new_button)
        layout.addWidget(header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        filters = QHBoxLayout()
        filters.setSpacing(10)
        filters.addWidget(QLabel("Route"))
        self.route_combo = QComboBox()
        self.route_combo.addItem("All routes", None)
        self.route_combo.currentIndexChanged.connect(self.refresh)
        filters.addWidget(self.route_combo, 1)
        filters.addWidget(QLabel("Lorry ID"))
        self.lorry_input = QLineEdit()
        self.lorry_input.setPlaceholderText("Optional lorry UUID")
        self.lorry_input.returnPressed.connect(self.refresh)
        filters.addWidget(self.lorry_input, 1)
        filters.addWidget(QLabel("Date"))
        self.date_input = QLineEdit()
        self.date_input.setPlaceholderText("YYYY-MM-DD")
        self.date_input.setMaximumWidth(120)
        self.date_input.returnPressed.connect(self.refresh)
        filters.addWidget(self.date_input)
        self.filter_button = ghost_button("Apply")
        self.filter_button.clicked.connect(self.refresh)
        filters.addWidget(self.filter_button)
        layout.addLayout(filters)

        self.table = DataTable(
            [
                ("route", "Route", 160),
                ("lorry", "Lorry", 160),
                ("driverId", "Driver ID", 210),
                ("helperId", "Helper ID", 210),
                ("effectiveFrom", "From", 120),
                ("effectiveTo", "To", 120),
                ("weekdays", "Weekdays", 120),
                ("status", "Status", 110),
                ("changeReason", "Change reason", 260),
            ]
        )
        self.table.set_formatter("route", self._format_route)
        self.table.set_formatter("lorry", self._format_lorry)
        for key in ("effectiveFrom", "effectiveTo"):
            self.table.set_formatter(key, lambda value, _row: format_date(value))
        self.table.set_formatter("status", lambda value, _row: title_case(value))
        self.table.set_formatter(
            "weekdays",
            lambda value, _row: ",".join(str(day) for day in (value or [])) or "-",
        )
        self.table.doubleClicked.connect(self.change_assignment)
        layout.addWidget(self.table, 1)

        actions = QHBoxLayout()
        self.change_button = ghost_button("Change selected")
        self.change_button.clicked.connect(self.change_assignment)
        actions.addWidget(self.change_button)
        actions.addStretch(1)
        layout.addLayout(actions)

    def refresh(self) -> None:
        self.banner.clear()
        if not self._date_ok(self.date_input.text().strip()):
            self.banner.show_error("Date filter must be YYYY-MM-DD or blank.")
            return
        run_async(self._load, self._apply, self._on_error)

    def _date_ok(self, value: str) -> bool:
        if not value:
            return True
        try:
            datetime.strptime(value, "%Y-%m-%d")
            return True
        except ValueError:
            return False

    def _load(self) -> dict[str, Any]:
        return {
            "assignments": self.session.fleet.list_assignments(
                route_id=self.route_combo.currentData(),
                lorry_id=self.lorry_input.text().strip() or None,
                date=self.date_input.text().strip() or None,
            ),
            "routes": self.session.fleet.list_routes(status="ACTIVE") or [],
            "lorries": self.session.fleet.list_lorries(status="ACTIVE") or [],
        }

    def _apply(self, data: dict[str, Any]) -> None:
        self.routes = list(data.get("routes") or [])
        self.lorries = list(data.get("lorries") or [])
        self._populate_route_filter()
        assignments = list(data.get("assignments") or [])
        self.table.set_rows(assignments)
        self.banner.show_info(f"{len(assignments)} assignment(s).")

    def _populate_route_filter(self) -> None:
        selected = self.route_combo.currentData()
        self.route_combo.blockSignals(True)
        self.route_combo.clear()
        self.route_combo.addItem("All routes", None)
        for route in self.routes:
            self.route_combo.addItem(
                f"{route.get('code') or '-'} - {route.get('name') or ''}".strip(" -"),
                route.get("id"),
            )
        index = self.route_combo.findData(selected)
        if index >= 0:
            self.route_combo.setCurrentIndex(index)
        self.route_combo.blockSignals(False)

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))

    def _selected(self) -> dict[str, Any] | None:
        row = self.table.selected_row()
        if not row:
            self.banner.show_info("Select an assignment first.")
        return row

    def _format_route(self, value: Any, row: dict[str, Any]) -> str:
        route = row.get("route") or value or {}
        return f"{route.get('code') or '-'} - {route.get('name') or ''}".strip(" -")

    def _format_lorry(self, value: Any, row: dict[str, Any]) -> str:
        lorry = row.get("lorry") or value or {}
        return str(lorry.get("registrationNo") or "-")

    def create_assignment(self) -> None:
        dialog = AssignmentFormDialog(self.routes, self.lorries, parent=self)
        if dialog.exec():
            run_async(
                lambda: self.session.fleet.create_assignment(dialog.payload),
                lambda _result: self.refresh(),
                self._on_error,
            )

    def change_assignment(self) -> None:
        row = self._selected()
        if not row:
            return
        dialog = AssignmentFormDialog(self.routes, self.lorries, row, self)
        if dialog.exec():
            run_async(
                lambda: self.session.fleet.change_assignment(row["id"], dialog.payload),
                lambda _result: self.refresh(),
                self._on_error,
            )
