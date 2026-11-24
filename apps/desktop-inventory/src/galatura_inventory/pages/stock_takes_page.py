"""Stock take creation, counted lines and completion for the C6 client."""

from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import uuid4

from galatura_desktop_core import ApiError, SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    PageHeader,
    StatusBanner,
    confirm,
    format_datetime,
    ghost_button,
    primary_button,
    run_async,
)
from PySide6.QtWidgets import (
    QComboBox,
    QFormLayout,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QVBoxLayout,
    QWidget,
)

from ..widgets.forms import populate_combo
from .common import decimal_text, label_for, row_id, rows_of, today_text


class StockTakesPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session
        self.locations: list[dict[str, Any]] = []
        self.items: list[dict[str, Any]] = []

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(12)

        self.header = PageHeader(
            "Stock Takes",
            "Open a count by location, enter counted quantities and complete it.",
        )
        self.refresh_button = ghost_button("Refresh")
        self.refresh_button.clicked.connect(self.refresh)
        self.header.add_action(self.refresh_button)
        layout.addWidget(self.header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        self.table = DataTable(
            [
                ("startedAt", "Started", 150),
                ("locationLabel", "Location", 220),
                ("status", "Status", 120),
                ("completedAt", "Completed", 150),
                ("id", "Stock take ID", 260),
            ]
        )
        self.table.itemSelectionChanged.connect(self._update_actions)
        layout.addWidget(self.table, 2)

        forms = QHBoxLayout()
        forms.setSpacing(12)

        take_frame = QFrame()
        take_frame.setObjectName("Panel")
        take_layout = QFormLayout(take_frame)
        take_layout.setContentsMargins(16, 12, 16, 12)
        self.location_combo = QComboBox()
        self.new_take_button = primary_button("New stock take")
        self.new_take_button.clicked.connect(self.new_stock_take)
        take_layout.addRow("Location", self.location_combo)
        take_layout.addRow(self.new_take_button)
        forms.addWidget(take_frame, 1)

        line_frame = QFrame()
        line_frame.setObjectName("Panel")
        line_layout = QFormLayout(line_frame)
        line_layout.setContentsMargins(16, 12, 16, 12)
        self.item_combo = QComboBox()
        self.system_input = QLineEdit("0")
        self.counted_input = QLineEdit("0")
        self.variance_label = QLabel("Variance: 0")
        self.add_line_button = primary_button("Add counted line")
        self.add_line_button.clicked.connect(self.add_line)
        self.system_input.textChanged.connect(self._update_variance)
        self.counted_input.textChanged.connect(self._update_variance)
        line_layout.addRow("Item", self.item_combo)
        line_layout.addRow("System quantity", self.system_input)
        line_layout.addRow("Counted quantity", self.counted_input)
        line_layout.addRow(self.variance_label)
        line_layout.addRow(self.add_line_button)
        forms.addWidget(line_frame, 1)
        layout.addLayout(forms)

        actions = QHBoxLayout()
        self.complete_button = primary_button("Complete selected")
        self.complete_button.clicked.connect(self.complete_stock_take)
        actions.addWidget(self.complete_button)
        actions.addStretch(1)
        layout.addLayout(actions)

        self._update_actions()

    def refresh(self) -> None:
        self.banner.clear()
        if not self.session.has_permission("stocktake:read"):
            self.banner.show_error("Your role does not include stocktake:read.")
            return
        run_async(self._load, self._apply, self._on_error)

    def _load(self) -> dict[str, Any]:
        inventory = self.session.inventory
        result: dict[str, Any] = {"takes": [], "locations": [], "items": []}
        for key, method in (
            ("takes", inventory.list_stock_takes),
            ("locations", inventory.list_locations),
            ("items", inventory.list_items),
        ):
            try:
                result[key] = method() or []
            except ApiError:
                result[key] = []
        return result

    def _apply(self, data: dict[str, Any]) -> None:
        self.locations = rows_of(data.get("locations"), "locations")
        self.items = rows_of(data.get("items"), "items")
        populate_combo(
            self.location_combo,
            self.locations,
            "code",
            "name",
            blank=True,
        )
        populate_combo(self.item_combo, self.items, "sku", "name", blank=True)

        locations = {str(row.get("id") or ""): row for row in self.locations}

        def location_label(_value: Any, row: dict[str, Any]) -> str:
            identifier = str(row.get("locationId") or "")
            return label_for(locations.get(identifier), "code", "name")

        self.table.set_formatter("startedAt", lambda value, _row: format_datetime(value))
        self.table.set_formatter("completedAt", lambda value, _row: format_datetime(value))
        self.table.set_formatter("locationLabel", location_label)
        self.table.set_rows(rows_of(data.get("takes"), "takes"))
        self._update_actions()
        self.banner.show_info(f"{self.table.rowCount()} stock take(s).")

    def _update_variance(self, _text: str = "") -> None:
        try:
            system = decimal_text(self.system_input.text(), "System quantity")
            counted = decimal_text(self.counted_input.text(), "Counted quantity")
        except ValueError:
            self.variance_label.setText("Variance: -")
            return
        value = Decimal(counted) - Decimal(system)
        self.variance_label.setText(f"Variance: {format(value, 'f')}")

    def _update_actions(self) -> None:
        selected = row_id(self.table.selected_row())
        self.new_take_button.setEnabled(self.session.has_permission("stocktake:create"))
        self.add_line_button.setEnabled(
            self.session.has_permission("stocktake:create") and bool(selected)
        )
        self.complete_button.setEnabled(
            self.session.has_permission("stocktake:complete") and bool(selected)
        )

    def new_stock_take(self) -> None:
        if not self.session.has_permission("stocktake:create"):
            self.banner.show_error("Your role cannot open stock takes.")
            return
        location_id = str(self.location_combo.currentData() or "")
        if not location_id:
            self.banner.show_info("Select a location first.")
            return
        payload = {"locationId": location_id, "startedAt": today_text()}
        run_async(
            lambda: self.session.inventory.create_stock_take(payload, str(uuid4())),
            lambda _result: self._on_success("Stock take opened."),
            self._on_error,
        )

    def add_line(self) -> None:
        if not self.session.has_permission("stocktake:create"):
            self.banner.show_error("Your role cannot add stock take lines.")
            return
        take_id = row_id(self.table.selected_row())
        if not take_id:
            self.banner.show_info("Select a stock take first.")
            return
        item_id = str(self.item_combo.currentData() or "")
        if not item_id:
            self.banner.show_info("Select an item first.")
            return
        try:
            system = decimal_text(self.system_input.text(), "System quantity")
            counted = decimal_text(self.counted_input.text(), "Counted quantity")
        except ValueError as exc:
            self.banner.show_error(str(exc))
            return
        variance = format(Decimal(counted) - Decimal(system), "f")
        payload = {
            "itemId": item_id,
            "systemQty": system,
            "countedQty": counted,
            "variance": variance,
        }
        run_async(
            lambda: self.session.inventory.add_stock_take_line(take_id, payload, str(uuid4())),
            lambda _result: self._on_success("Counted line added."),
            self._on_error,
        )

    def complete_stock_take(self) -> None:
        if not self.session.has_permission("stocktake:complete"):
            self.banner.show_error("Your role cannot complete stock takes.")
            return
        take_id = row_id(self.table.selected_row())
        if not take_id:
            self.banner.show_info("Select a stock take first.")
            return
        question = "Complete this stock take and apply variances?"
        if not confirm(self, "Complete stock take", question):
            return
        run_async(
            lambda: self.session.inventory.complete_stock_take(take_id, str(uuid4())),
            lambda _result: self._on_success("Stock take completed."),
            self._on_error,
        )

    def _on_success(self, message: str) -> None:
        self.banner.show_success(message)
        self.refresh()

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))
