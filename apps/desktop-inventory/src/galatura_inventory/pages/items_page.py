"""Inventory item register and supporting master data."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import ApiError, SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    PageHeader,
    StatusBanner,
    confirm,
    format_bool,
    ghost_button,
    primary_button,
    run_async,
)
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QFrame,
    QHBoxLayout,
    QLineEdit,
    QVBoxLayout,
    QWidget,
)

from ..widgets.forms import ReferenceFormDialog, populate_combo
from ..widgets.master_data import MasterDataPanel
from .common import decimal_text, find_row, format_quantity, row_id, rows_of


class ItemDialog(ReferenceFormDialog):
    def __init__(
        self,
        references: dict[str, Any],
        item: dict[str, Any] | None = None,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__("Edit item" if item else "New item", references, parent)
        current = item or {}
        self.sku_input = QLineEdit(str(current.get("sku") or ""))
        self.name_input = QLineEdit(str(current.get("name") or ""))
        self.barcode_input = QLineEdit(str(current.get("barcode") or ""))
        self.add_row("SKU", self.sku_input)
        self.add_row("Name", self.name_input)
        self.add_row("Barcode", self.barcode_input)
        self.category_combo = self.add_combo("Category", "categories", "name", "id")
        self.unit_combo = self.add_combo("Unit", "units", "code", "name")
        self.reorder_input = QLineEdit(str(current.get("reorderLevel") or "0"))
        self.reorder_qty_input = QLineEdit(str(current.get("reorderQty") or "0"))
        self.valuation_combo = QComboBox()
        for label, value in (
            ("Weighted average", "WEIGHTED_AVG"),
            ("FIFO", "FIFO"),
            ("LIFO", "LIFO"),
        ):
            self.valuation_combo.addItem(label, value)
        index = self.valuation_combo.findData(current.get("valuationMethod") or "WEIGHTED_AVG")
        if index >= 0:
            self.valuation_combo.setCurrentIndex(index)
        self.batch_check = QCheckBox("Batch tracked")
        self.batch_check.setChecked(bool(current.get("isBatchTracked")))
        self.active_check = QCheckBox("Active")
        self.active_check.setChecked(current.get("active") is not False)

        self.add_row("Reorder level", self.reorder_input)
        self.add_row("Reorder quantity", self.reorder_qty_input)
        self.add_row("Valuation method", self.valuation_combo)
        self.add_row("Batch tracked", self.batch_check)
        self.add_row("Active", self.active_check)

        category_id = str(current.get("categoryId") or "")
        unit_id = str(current.get("unitId") or "")
        populate_combo(
            self.category_combo,
            rows_of(references.get("categories")),
            "name",
            "id",
            current=category_id,
        )
        populate_combo(
            self.unit_combo,
            rows_of(references.get("units")),
            "code",
            "name",
            current=unit_id,
        )

    def validate(self) -> str | None:
        try:
            if not self.sku_input.text().strip():
                return "SKU is required."
            if not self.name_input.text().strip():
                return "Name is required."
            if not self.selected_id(self.category_combo):
                return "Select a category."
            if not self.selected_id(self.unit_combo):
                return "Select a unit."
            decimal_text(self.reorder_input.text(), "Reorder level")
            decimal_text(self.reorder_qty_input.text(), "Reorder quantity")
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        return {
            "sku": self.sku_input.text().strip(),
            "name": self.name_input.text().strip(),
            "barcode": self.barcode_input.text().strip() or None,
            "categoryId": self.selected_id(self.category_combo),
            "unitId": self.selected_id(self.unit_combo),
            "reorderLevel": decimal_text(self.reorder_input.text(), "Reorder level"),
            "reorderQty": decimal_text(self.reorder_qty_input.text(), "Reorder quantity"),
            "valuationMethod": self.valuation_combo.currentData(),
            "isBatchTracked": self.batch_check.isChecked(),
            "active": self.active_check.isChecked(),
        }


class ItemsPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session
        self.references: dict[str, Any] = {"categories": [], "units": []}

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(12)

        self.header = PageHeader(
            "Items",
            "Maintain the item register with categories, units and reorder levels.",
        )
        self.refresh_button = ghost_button("Refresh")
        self.refresh_button.clicked.connect(self.refresh)
        self.header.add_action(self.refresh_button)
        layout.addWidget(self.header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        self.table = DataTable(
            [
                ("sku", "SKU", 130),
                ("name", "Name", 220),
                ("category", "Category", 160),
                ("unit", "Unit", 100),
                ("reorderLevel", "Reorder at", 120),
                ("reorderQty", "Reorder qty", 120),
                ("valuationMethod", "Valuation", 140),
                ("active", "Active", 80),
                ("id", "ID", 220),
            ]
        )
        self.table.set_formatter("reorderLevel", format_quantity)
        self.table.set_formatter("reorderQty", format_quantity)
        self.table.set_formatter("active", lambda value, _row: format_bool(value))
        layout.addWidget(self.table, 2)

        actions = QHBoxLayout()
        actions.setSpacing(8)
        self.new_button = primary_button("New item")
        self.new_button.clicked.connect(self.create_item)
        self.edit_button = primary_button("Edit selected")
        self.edit_button.clicked.connect(self.edit_item)
        self.deactivate_button = primary_button("Deactivate")
        self.deactivate_button.clicked.connect(self.deactivate_item)
        for button in (self.new_button, self.edit_button, self.deactivate_button):
            actions.addWidget(button)
        actions.addStretch(1)
        layout.addLayout(actions)

        panel_frame = QFrame()
        panel_frame.setObjectName("Panel")
        panel_layout = QVBoxLayout(panel_frame)
        panel_layout.setContentsMargins(4, 4, 4, 4)
        self.master_data = MasterDataPanel(session)
        panel_layout.addWidget(self.master_data)
        layout.addWidget(panel_frame, 2)

        self.table.itemSelectionChanged.connect(self._update_actions)
        self._update_actions()

    def refresh(self) -> None:
        self.banner.clear()
        run_async(self._load, self._apply, self._on_error)
        self.master_data.refresh()

    def _load(self) -> dict[str, Any]:
        inventory = self.session.inventory
        result: dict[str, Any] = {"items": [], "categories": [], "units": []}
        for key, method in (
            ("items", inventory.list_items),
            ("categories", inventory.list_categories),
            ("units", inventory.list_units),
        ):
            try:
                result[key] = method() or []
            except ApiError:
                result[key] = []
        return result

    def _apply(self, data: dict[str, Any]) -> None:
        self.references = {
            "categories": rows_of(data.get("categories"), "categories"),
            "units": rows_of(data.get("units"), "units"),
        }
        items = rows_of(data.get("items"), "items")
        categories = self.references["categories"]
        units = self.references["units"]
        rows: list[dict[str, Any]] = []
        for item in items:
            category = find_row(categories, str(item.get("categoryId") or ""))
            unit = find_row(units, str(item.get("unitId") or ""))
            rows.append(
                {
                    **item,
                    "category": category.get("name") if category else "-",
                    "unit": (
                        unit.get("code") or unit.get("name") if unit else "-"
                    ),
                }
            )
        self.table.set_rows(rows)
        self._update_actions()
        self.banner.show_info(f"{len(rows)} item(s).")

    def _update_actions(self) -> None:
        selected = self.table.selected_row()
        self.new_button.setEnabled(self.session.has_permission("item:create"))
        self.edit_button.setEnabled(
            self.session.has_permission("item:update") and bool(row_id(selected))
        )
        self.deactivate_button.setEnabled(
            self.session.has_permission("item:deactivate") and bool(row_id(selected))
        )

    def create_item(self) -> None:
        dialog = ItemDialog(self.references, parent=self)
        if not dialog.exec():
            return
        payload = dialog.payload
        run_async(
            lambda: self.session.inventory.create_item(payload),
            lambda _result: self._on_success("Item created."),
            self._on_error,
        )

    def edit_item(self) -> None:
        selected = self.table.selected_row()
        if not selected:
            self.banner.show_info("Select an item first.")
            return
        dialog = ItemDialog(self.references, selected, parent=self)
        if not dialog.exec():
            return
        payload = dialog.payload
        identifier = row_id(selected)
        run_async(
            lambda: self.session.inventory.update_item(identifier, payload),
            lambda _result: self._on_success("Item updated."),
            self._on_error,
        )

    def deactivate_item(self) -> None:
        selected = self.table.selected_row()
        if not selected:
            self.banner.show_info("Select an item first.")
            return
        if not confirm(self, "Deactivate item", "Deactivate this item? History stays intact."):
            return
        identifier = row_id(selected)
        run_async(
            lambda: self.session.inventory.deactivate_item(identifier),
            lambda _result: self._on_success("Item deactivated."),
            self._on_error,
        )

    def _on_success(self, message: str) -> None:
        self.banner.show_success(message)
        self.refresh()

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))
