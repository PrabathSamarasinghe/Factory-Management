"""Compact master-data editor for categories, units, warehouses, locations and vendors."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from galatura_desktop_core import ApiError, SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    PageHeader,
    StatusBanner,
    ghost_button,
    primary_button,
    run_async,
)
from PySide6.QtWidgets import (
    QFormLayout,
    QFrame,
    QHBoxLayout,
    QLineEdit,
    QPushButton,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from ..pages.common import row_id, rows_of


@dataclass(frozen=True)
class _Spec:
    key: str
    title: str
    columns: tuple[tuple[str, str, int], ...]
    fields: tuple[tuple[str, str], ...]
    list_method: str
    create_method: str
    update_method: str | None
    read_permission: str
    write_permission: str


_SPECS: tuple[_Spec, ...] = (
    _Spec(
        "categories",
        "Categories",
        (("name", "Name", 260), ("id", "ID", 320)),
        (("name", "Name"),),
        "list_categories",
        "create_category",
        "update_category",
        "category:read",
        "category:write",
    ),
    _Spec(
        "units",
        "Units",
        (("code", "Code", 120), ("name", "Name", 220), ("id", "ID", 300)),
        (("code", "Code"), ("name", "Name")),
        "list_units",
        "create_unit",
        None,
        "unit:read",
        "unit:write",
    ),
    _Spec(
        "warehouses",
        "Warehouses",
        (("name", "Name", 220), ("location", "Location", 220), ("id", "ID", 300)),
        (("name", "Name"), ("location", "Location")),
        "list_warehouses",
        "create_warehouse",
        "update_warehouse",
        "warehouse:read",
        "warehouse:write",
    ),
    _Spec(
        "locations",
        "Locations",
        (
            ("warehouseId", "Warehouse ID", 200),
            ("code", "Code", 120),
            ("name", "Name", 200),
            ("id", "ID", 260),
        ),
        (("warehouseId", "Warehouse ID"), ("code", "Code"), ("name", "Name")),
        "list_locations",
        "create_location",
        None,
        "warehouse:read",
        "warehouse:write",
    ),
    _Spec(
        "vendors",
        "Vendors",
        (
            ("name", "Name", 200),
            ("contact", "Contact", 160),
            ("phone", "Phone", 140),
            ("taxNo", "Tax no", 140),
            ("id", "ID", 260),
        ),
        (
            ("name", "Name"),
            ("contact", "Contact"),
            ("phone", "Phone"),
            ("address", "Address"),
            ("taxNo", "Tax no"),
        ),
        "list_vendors",
        "create_vendor",
        "update_vendor",
        "vendor:read",
        "vendor:write",
    ),
)


class MasterDataPanel(QWidget):
    def __init__(self, session: SessionManager, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.session = session
        self.rows: dict[str, list[dict[str, Any]]] = {}
        self.tables: dict[str, DataTable] = {}
        self.inputs: dict[str, dict[str, QLineEdit]] = {}
        self.add_buttons: dict[str, QPushButton] = {}
        self.update_buttons: dict[str, QPushButton] = {}

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(10)

        header = PageHeader("Master data", "Categories, units, warehouses, locations and vendors.")
        self.refresh_button = ghost_button("Refresh")
        self.refresh_button.clicked.connect(self.refresh)
        header.add_action(self.refresh_button)
        layout.addWidget(header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        tabs = QTabWidget()
        for spec in _SPECS:
            tabs.addTab(self._build_tab(spec), spec.title)
        layout.addWidget(tabs, 1)

    def _build_tab(self, spec: _Spec) -> QWidget:
        tab = QWidget()
        layout = QVBoxLayout(tab)
        layout.setContentsMargins(16, 12, 16, 12)
        layout.setSpacing(8)

        table = DataTable(spec.columns)
        table.itemSelectionChanged.connect(lambda: self._on_selection(spec))
        self.tables[spec.key] = table
        layout.addWidget(table, 1)

        form_frame = QFrame()
        form_frame.setObjectName("Panel")
        form_layout = QFormLayout(form_frame)
        form_layout.setContentsMargins(14, 10, 14, 10)
        inputs: dict[str, QLineEdit] = {}
        for field_key, label in spec.fields:
            line_edit = QLineEdit()
            line_edit.setPlaceholderText(label)
            inputs[field_key] = line_edit
            form_layout.addRow(label, line_edit)
        self.inputs[spec.key] = inputs
        layout.addWidget(form_frame)

        actions = QHBoxLayout()
        actions.setSpacing(8)
        add_button = primary_button("Add")
        add_button.clicked.connect(lambda: self._create(spec))
        add_button.setEnabled(self.session.has_permission(spec.write_permission))
        self.add_buttons[spec.key] = add_button
        actions.addWidget(add_button)

        if spec.update_method:
            update_button = QPushButton("Update selected")
            update_button.clicked.connect(lambda: self._update(spec))
            update_button.setEnabled(False)
            self.update_buttons[spec.key] = update_button
            actions.addWidget(update_button)

        clear_button = ghost_button("Clear")
        clear_button.clicked.connect(lambda: self._clear(spec))
        actions.addWidget(clear_button)
        actions.addStretch(1)
        layout.addLayout(actions)
        return tab

    def refresh(self) -> None:
        self.banner.clear()
        run_async(self._load, self._apply, self._on_error)

    def _load(self) -> dict[str, Any]:
        result: dict[str, Any] = {}
        for spec in _SPECS:
            try:
                result[spec.key] = getattr(self.session.inventory, spec.list_method)() or []
            except ApiError:
                result[spec.key] = []
        return result

    def _apply(self, data: dict[str, Any]) -> None:
        for spec in _SPECS:
            rows = rows_of(data.get(spec.key))
            self.rows[spec.key] = rows
            self.tables[spec.key].set_rows(rows)
        self.banner.show_info("Master data loaded.")

    def _on_selection(self, spec: _Spec) -> None:
        selected = self.tables[spec.key].selected_row() or {}
        for field_key, line_edit in self.inputs[spec.key].items():
            line_edit.setText(str(selected.get(field_key) or ""))
        button = self.update_buttons.get(spec.key)
        if button:
            button.setEnabled(
                bool(row_id(selected)) and self.session.has_permission(spec.write_permission)
            )

    def _clear(self, spec: _Spec) -> None:
        self.tables[spec.key].clearSelection()
        for line_edit in self.inputs[spec.key].values():
            line_edit.clear()
        button = self.update_buttons.get(spec.key)
        if button:
            button.setEnabled(False)

    def _payload(self, spec: _Spec) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        for field_key, label in spec.fields:
            value = self.inputs[spec.key][field_key].text().strip()
            if value:
                payload[field_key] = value
            elif field_key in {"name", "code"}:
                raise ValueError(f"{label} is required.")
        return payload

    def _create(self, spec: _Spec) -> None:
        if not self.session.has_permission(spec.write_permission):
            self.banner.show_error(f"Your role does not include {spec.write_permission}.")
            return
        try:
            payload = self._payload(spec)
        except ValueError as exc:
            self.banner.show_error(str(exc))
            return
        run_async(
            lambda: getattr(self.session.inventory, spec.create_method)(payload),
            lambda _result: self._on_success(f"{spec.title} entry created."),
            self._on_error,
        )

    def _update(self, spec: _Spec) -> None:
        if not spec.update_method:
            return
        selected = self.tables[spec.key].selected_row()
        identifier = row_id(selected)
        if not identifier:
            self.banner.show_info("Select a row first.")
            return
        try:
            payload = self._payload(spec)
        except ValueError as exc:
            self.banner.show_error(str(exc))
            return
        run_async(
            lambda: getattr(self.session.inventory, spec.update_method)(identifier, payload),
            lambda _result: self._on_success(f"{spec.title} entry updated."),
            self._on_error,
        )

    def _on_success(self, message: str) -> None:
        self.banner.show_success(message)
        self.refresh()

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))
