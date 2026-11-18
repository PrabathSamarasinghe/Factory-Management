"""Lorry registry, documents and maintenance page."""

from __future__ import annotations

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
    QDialog,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QVBoxLayout,
    QWidget,
)

from ..dialogs.fleet_alerts import FleetAlertsDialog
from ..dialogs.lorry_document import LorryDocumentDialog, MaintenanceDialog
from ..dialogs.lorry_form import LORRY_STATUSES, LorryFormDialog


class LorriesPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session
        self.dialog: QDialog | None = None

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(16)

        header = PageHeader(
            "Lorries",
            "Fleet registration, statutory documents, maintenance and expiry alerts.",
        )
        self.refresh_button = ghost_button("Refresh")
        self.refresh_button.clicked.connect(self.refresh)
        self.alerts_button = ghost_button("Alerts")
        self.alerts_button.clicked.connect(self.open_alerts)
        self.new_button = primary_button("New lorry")
        self.new_button.clicked.connect(self.create_lorry)
        header.add_action(self.refresh_button)
        header.add_action(self.alerts_button)
        header.add_action(self.new_button)
        layout.addWidget(header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        filters = QHBoxLayout()
        filters.setSpacing(10)
        filters.addWidget(QLabel("Search"))
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("Registration, make, model, chassis or engine")
        self.search_input.returnPressed.connect(self.refresh)
        filters.addWidget(self.search_input, 1)
        filters.addWidget(QLabel("Status"))
        self.status_combo = QComboBox()
        self.status_combo.addItem("All statuses", None)
        for status in LORRY_STATUSES:
            self.status_combo.addItem(status.title(), status)
        self.status_combo.currentIndexChanged.connect(self.refresh)
        filters.addWidget(self.status_combo)
        layout.addLayout(filters)

        self.table = DataTable(
            [
                ("registrationNo", "Registration", 150),
                ("make", "Make", 120),
                ("model", "Model", 130),
                ("status", "Status", 120),
                ("currentOdometerKm", "Odometer (km)", 130),
                ("insuranceExpiry", "Insurance", 120),
                ("revenueLicenceExpiry", "Revenue licence", 130),
                ("emissionTestExpiry", "Emission", 120),
            ]
        )
        for key in ("status",):
            self.table.set_formatter(key, lambda value, _row: title_case(value))
        for key in ("insuranceExpiry", "revenueLicenceExpiry", "emissionTestExpiry"):
            self.table.set_formatter(key, lambda value, _row: format_date(value))
        self.table.doubleClicked.connect(self.edit_lorry)
        layout.addWidget(self.table, 1)

        actions = QHBoxLayout()
        self.edit_button = ghost_button("Edit selected")
        self.edit_button.clicked.connect(self.edit_lorry)
        self.document_button = ghost_button("Add document")
        self.document_button.clicked.connect(self.add_document)
        self.maintenance_button = ghost_button("Add maintenance")
        self.maintenance_button.clicked.connect(self.add_maintenance)
        actions.addWidget(self.edit_button)
        actions.addWidget(self.document_button)
        actions.addWidget(self.maintenance_button)
        actions.addStretch(1)
        layout.addLayout(actions)

    def refresh(self) -> None:
        self.banner.clear()
        run_async(self._load, self._apply, self._on_error)

    def _load(self) -> list[dict[str, Any]]:
        return self.session.fleet.list_lorries(
            status=self.status_combo.currentData(),
            query=self.search_input.text().strip() or None,
        )

    def _apply(self, rows: list[dict[str, Any]]) -> None:
        self.table.set_rows(rows)
        self.banner.show_info(f"{len(rows)} lorry record(s).")

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))

    def _selected(self) -> dict[str, Any] | None:
        row = self.table.selected_row()
        if not row:
            self.banner.show_info("Select a lorry first.")
        return row

    def create_lorry(self) -> None:
        dialog = LorryFormDialog(parent=self)
        if dialog.exec():
            run_async(
                lambda: self.session.fleet.create_lorry(dialog.payload),
                lambda _result: self.refresh(),
                self._on_error,
            )

    def edit_lorry(self) -> None:
        row = self._selected()
        if not row:
            return
        dialog = LorryFormDialog(row, self)
        if dialog.exec():
            run_async(
                lambda: self.session.fleet.update_lorry(row["id"], dialog.payload),
                lambda _result: self.refresh(),
                self._on_error,
            )

    def add_document(self) -> None:
        row = self._selected()
        if not row:
            return
        dialog = LorryDocumentDialog(self)
        if dialog.exec():
            run_async(
                lambda: self.session.fleet.add_lorry_document(row["id"], dialog.payload),
                lambda _result: self.banner.show_success("Document metadata saved."),
                self._on_error,
            )

    def add_maintenance(self) -> None:
        row = self._selected()
        if not row:
            return
        dialog = MaintenanceDialog(str(row.get("currentOdometerKm") or ""), self)
        if dialog.exec():
            run_async(
                lambda: self.session.fleet.add_lorry_maintenance(row["id"], dialog.payload),
                lambda _result: self.refresh(),
                self._on_error,
            )

    def open_alerts(self) -> None:
        run_async(self.session.fleet.alerts, self._show_alerts, self._on_error)

    def _show_alerts(self, data: dict[str, Any]) -> None:
        dialog = FleetAlertsDialog(list(data.get("alerts") or []), self)
        self.dialog = dialog
        dialog.exec()
