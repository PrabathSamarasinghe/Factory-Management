"""Route and ordered stop management page."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    PageHeader,
    StatusBanner,
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

from ..dialogs.route_form import ROUTE_STATUSES, RouteFormDialog
from ..dialogs.stops_editor import StopsEditorDialog


class RoutesPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session
        self.dialog: QDialog | None = None

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(16)

        header = PageHeader("Routes", "Maintain collection routes and their ordered stops.")
        self.refresh_button = ghost_button("Refresh")
        self.refresh_button.clicked.connect(self.refresh)
        self.new_button = primary_button("New route")
        self.new_button.clicked.connect(self.create_route)
        header.add_action(self.refresh_button)
        header.add_action(self.new_button)
        layout.addWidget(header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        filters = QHBoxLayout()
        filters.setSpacing(10)
        filters.addWidget(QLabel("Search"))
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("Route code or name")
        self.search_input.returnPressed.connect(self.refresh)
        filters.addWidget(self.search_input, 1)
        filters.addWidget(QLabel("Status"))
        self.status_combo = QComboBox()
        self.status_combo.addItem("All statuses", None)
        for status in ROUTE_STATUSES:
            self.status_combo.addItem(status.title(), status)
        self.status_combo.currentIndexChanged.connect(self.refresh)
        filters.addWidget(self.status_combo)
        layout.addLayout(filters)

        self.table = DataTable(
            [
                ("code", "Code", 110),
                ("name", "Name", 220),
                ("status", "Status", 120),
                ("estimatedDistanceKm", "Distance (km)", 140),
                ("stopCount", "Stops", 90),
                ("description", "Description", 300),
            ]
        )
        self.table.set_formatter("status", lambda value, _row: title_case(value))
        self.table.doubleClicked.connect(self.edit_route)
        layout.addWidget(self.table, 1)

        actions = QHBoxLayout()
        self.edit_button = ghost_button("Edit selected")
        self.edit_button.clicked.connect(self.edit_route)
        self.stops_button = ghost_button("Edit stops")
        self.stops_button.clicked.connect(self.edit_stops)
        actions.addWidget(self.edit_button)
        actions.addWidget(self.stops_button)
        actions.addStretch(1)
        layout.addLayout(actions)

    def refresh(self) -> None:
        self.banner.clear()
        run_async(self._load, self._apply, self._on_error)

    def _load(self) -> list[dict[str, Any]]:
        return self.session.fleet.list_routes(
            status=self.status_combo.currentData(),
            query=self.search_input.text().strip() or None,
        )

    def _apply(self, rows: list[dict[str, Any]]) -> None:
        view = []
        for row in rows:
            item = dict(row)
            item["stopCount"] = len(row.get("stops") or [])
            view.append(item)
        self.table.set_rows(view)
        self.banner.show_info(f"{len(view)} route(s).")

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))

    def _selected(self) -> dict[str, Any] | None:
        row = self.table.selected_row()
        if not row:
            self.banner.show_info("Select a route first.")
        return row

    def create_route(self) -> None:
        dialog = RouteFormDialog(parent=self)
        if dialog.exec():
            run_async(
                lambda: self.session.fleet.create_route(dialog.payload),
                lambda _result: self.refresh(),
                self._on_error,
            )

    def edit_route(self) -> None:
        row = self._selected()
        if not row:
            return
        dialog = RouteFormDialog(row, self)
        if dialog.exec():
            run_async(
                lambda: self.session.fleet.update_route(row["id"], dialog.payload),
                lambda _result: self.refresh(),
                self._on_error,
            )

    def edit_stops(self) -> None:
        row = self._selected()
        if not row:
            return
        run_async(
            lambda: self.session.fleet.get_route(row["id"]),
            self._open_stops_editor,
            self._on_error,
        )

    def _open_stops_editor(self, route: dict[str, Any]) -> None:
        dialog = StopsEditorDialog(list(route.get("stops") or []), self)
        self.dialog = dialog
        if not dialog.exec():
            return
        run_async(
            lambda: self.session.fleet.replace_route_stops(
                route["id"], dialog.stops_payload
            ),
            lambda _result: self.refresh(),
            self._on_error,
        )
