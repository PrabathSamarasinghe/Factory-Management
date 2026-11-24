"""Stock balances, movements, low-stock alerts and valuation report."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import ApiError, SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    PageHeader,
    StatusBanner,
    format_datetime,
    format_money,
    ghost_button,
    run_async,
)
from PySide6.QtWidgets import (
    QComboBox,
    QFormLayout,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from ..widgets.forms import populate_combo
from .common import format_quantity, label_for, rows_of


class StockPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session
        self.items: list[dict[str, Any]] = []
        self.locations: list[dict[str, Any]] = []

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(12)

        self.header = PageHeader(
            "Stock",
            "Balances, immutable movements, low-stock alerts and stock valuation.",
        )
        self.refresh_button = ghost_button("Refresh")
        self.refresh_button.clicked.connect(self.refresh)
        self.header.add_action(self.refresh_button)
        layout.addWidget(self.header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        filters_frame = QFrame()
        filters_frame.setObjectName("Panel")
        filters_layout = QFormLayout(filters_frame)
        filters_layout.setContentsMargins(16, 10, 16, 10)
        filters_layout.setHorizontalSpacing(12)
        filters_layout.setVerticalSpacing(6)
        self.item_combo = QComboBox()
        self.location_combo = QComboBox()
        self.from_input = QLineEdit()
        self.from_input.setPlaceholderText("YYYY-MM-DD (optional)")
        self.to_input = QLineEdit()
        self.to_input.setPlaceholderText("YYYY-MM-DD (optional)")
        self.as_of_input = QLineEdit()
        self.as_of_input.setPlaceholderText("YYYY-MM-DD (optional)")
        filters_row = QHBoxLayout()
        filters_row.setSpacing(10)
        filters_row.addWidget(QLabel("Item"))
        filters_row.addWidget(self.item_combo, 2)
        filters_row.addWidget(QLabel("Location"))
        filters_row.addWidget(self.location_combo, 2)
        filters_row.addWidget(QLabel("From"))
        filters_row.addWidget(self.from_input, 1)
        filters_row.addWidget(QLabel("To"))
        filters_row.addWidget(self.to_input, 1)
        filters_row.addWidget(QLabel("As of"))
        filters_row.addWidget(self.as_of_input, 1)
        filters_layout.addRow(filters_row)
        layout.addWidget(filters_frame)

        self.tabs = QTabWidget()
        self.balances_table = DataTable(
            [
                ("itemLabel", "Item", 240),
                ("locationLabel", "Location", 200),
                ("qtyOnHand", "On hand", 120),
                ("avgCost", "Avg cost", 130),
                ("updatedAt", "Updated", 150),
            ]
        )
        self.movements_table = DataTable(
            [
                ("occurredAt", "When", 150),
                ("movementType", "Type", 140),
                ("itemLabel", "Item", 220),
                ("locationLabel", "Location", 180),
                ("qty", "Qty", 110),
                ("unitCost", "Unit cost", 120),
                ("reference", "Reference", 180),
            ]
        )
        self.alerts_table = DataTable(
            [
                ("itemLabel", "Item", 240),
                ("locationLabel", "Location", 200),
                ("qtyOnHand", "On hand", 120),
                ("reorderLevel", "Reorder at", 120),
                ("status", "Status", 120),
            ]
        )
        self.valuation_table = DataTable(
            [
                ("itemLabel", "Item", 240),
                ("locationLabel", "Location", 180),
                ("qtyOnHand", "Qty", 110),
                ("avgCost", "Avg cost", 130),
                ("totalValue", "Value", 140),
            ]
        )
        for table in (
            self.balances_table,
            self.movements_table,
            self.alerts_table,
            self.valuation_table,
        ):
            table.set_formatter("occurredAt", lambda value, _row: format_datetime(value))
            table.set_formatter("updatedAt", lambda value, _row: format_datetime(value))
            table.set_formatter("qtyOnHand", format_quantity)
            table.set_formatter("qty", format_quantity)
            table.set_formatter("reorderLevel", format_quantity)
            table.set_formatter("avgCost", lambda value, _row: format_money(value))
            table.set_formatter("unitCost", lambda value, _row: format_money(value))
            table.set_formatter("totalValue", lambda value, _row: format_money(value))
        self.tabs.addTab(self.balances_table, "Balances")
        self.tabs.addTab(self.movements_table, "Movements")
        self.tabs.addTab(self.alerts_table, "Low stock")
        self.tabs.addTab(self.valuation_table, "Valuation")
        layout.addWidget(self.tabs, 1)

    def refresh(self) -> None:
        self.banner.clear()
        if not self.session.has_permission("stock:read"):
            self.banner.show_error("Your role does not include stock:read.")
            return
        item_id = str(self.item_combo.currentData() or "") or None
        location_id = str(self.location_combo.currentData() or "") or None
        from_date = self.from_input.text().strip() or None
        to_date = self.to_input.text().strip() or None
        as_of = self.as_of_input.text().strip() or None
        run_async(
            lambda: self._load(item_id, location_id, from_date, to_date, as_of),
            self._apply,
            self._on_error,
        )

    def _load(
        self,
        item_id: str | None,
        location_id: str | None,
        from_date: str | None,
        to_date: str | None,
        as_of: str | None,
    ) -> dict[str, Any]:
        inventory = self.session.inventory
        result: dict[str, Any] = {
            "balances": [],
            "movements": [],
            "alerts": [],
            "valuation": [],
            "items": [],
            "locations": [],
        }
        calls = (
            ("balances", lambda: inventory.stock_balances(
                item_id=item_id, location_id=location_id
            )),
            ("movements", lambda: inventory.stock_movements(
                item_id=item_id,
                location_id=location_id,
                from_date=from_date,
                to_date=to_date,
            )),
            ("alerts", inventory.low_stock_alerts),
            ("valuation", lambda: inventory.valuation_report(as_of=as_of)),
            ("items", inventory.list_items),
            ("locations", inventory.list_locations),
        )
        for key, method in calls:
            try:
                result[key] = method() or []
            except ApiError:
                result[key] = []
        return result

    def _apply(self, data: dict[str, Any]) -> None:
        self.items = rows_of(data.get("items"), "items")
        self.locations = rows_of(data.get("locations"), "locations")
        items = {str(row.get("id") or ""): row for row in self.items}
        locations = {str(row.get("id") or ""): row for row in self.locations}
        selected_item = str(self.item_combo.currentData() or "")
        selected_location = str(self.location_combo.currentData() or "")
        populate_combo(
            self.item_combo,
            self.items,
            "sku",
            "name",
            blank=True,
            current=selected_item,
        )
        populate_combo(
            self.location_combo,
            self.locations,
            "code",
            "name",
            blank=True,
            current=selected_location,
        )

        self.balances_table.set_rows(self._with_labels(data.get("balances"), items, locations))
        self.movements_table.set_rows(self._with_labels(data.get("movements"), items, locations))
        self.alerts_table.set_rows(self._with_labels(data.get("alerts"), items, locations))
        self.valuation_table.set_rows(self._with_labels(data.get("valuation"), items, locations))
        self.banner.show_info(
            f"{self.balances_table.rowCount()} balance(s), "
            f"{self.alerts_table.rowCount()} alert(s)."
        )

    @staticmethod
    def _with_labels(
        data: Any,
        items: dict[str, dict[str, Any]],
        locations: dict[str, dict[str, Any]],
    ) -> list[dict[str, Any]]:
        rows: list[dict[str, Any]] = []
        for row in rows_of(data):
            item = items.get(str(row.get("itemId") or ""))
            location = locations.get(str(row.get("locationId") or ""))
            rows.append(
                {
                    **row,
                    "itemLabel": label_for(item, "sku", "name"),
                    "locationLabel": label_for(location, "code", "name"),
                }
            )
        return rows

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))
