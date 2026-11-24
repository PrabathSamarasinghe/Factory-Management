"""Inventory dashboard with key counts and recent stock movements."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import ApiError, SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    PageHeader,
    StatCard,
    StatusBanner,
    format_datetime,
    format_money,
    ghost_button,
    run_async,
)
from PySide6.QtWidgets import QHBoxLayout, QVBoxLayout, QWidget

from .common import format_quantity, rows_of


class DashboardPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(14)

        self.header = PageHeader(
            "Dashboard",
            "Stock position, alerts and the most recent inventory movements.",
        )
        self.refresh_button = ghost_button("Refresh")
        self.refresh_button.clicked.connect(self.refresh)
        self.header.add_action(self.refresh_button)
        layout.addWidget(self.header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        cards = QHBoxLayout()
        cards.setSpacing(12)
        self.items_card = StatCard("Active items")
        self.alerts_card = StatCard("Low-stock alerts")
        self.receipts_card = StatCard("Draft receipts")
        self.issues_card = StatCard("Draft issues")
        for card in (self.items_card, self.alerts_card, self.receipts_card, self.issues_card):
            cards.addWidget(card)
        layout.addLayout(cards)

        self.movements_table = DataTable(
            [
                ("occurredAt", "When", 150),
                ("movementType", "Type", 140),
                ("itemId", "Item", 220),
                ("locationId", "Location", 220),
                ("qty", "Qty", 110),
                ("unitCost", "Unit cost", 130),
            ]
        )
        self.movements_table.set_formatter("occurredAt", lambda value, _row: format_datetime(value))
        self.movements_table.set_formatter("qty", format_quantity)
        self.movements_table.set_formatter("unitCost", lambda value, _row: format_money(value))
        layout.addWidget(self.movements_table, 1)

    def refresh(self) -> None:
        self.banner.clear()
        run_async(self._load, self._apply, self._on_error)

    @staticmethod
    def _fetch(fn: Any, fallback: Any) -> Any:
        try:
            return fn() or fallback
        except ApiError:
            return fallback

    def _load(self) -> dict[str, Any]:
        inventory = self.session.inventory
        return {
            "health": self._fetch(inventory.health, {}),
            "items": self._fetch(inventory.list_items, []),
            "alerts": self._fetch(inventory.low_stock_alerts, []),
            "receipts": self._fetch(inventory.list_goods_receipts, []),
            "issues": self._fetch(inventory.list_goods_issues, []),
            "movements": self._fetch(inventory.stock_movements, []),
        }

    def _apply(self, data: dict[str, Any]) -> None:
        items = rows_of(data.get("items"), "items")
        alerts = rows_of(data.get("alerts"), "alerts")
        receipts = rows_of(data.get("receipts"), "receipts")
        issues = rows_of(data.get("issues"), "issues")
        movements = rows_of(data.get("movements"), "movements")

        self.items_card.set_value(str(len(items)))
        self.alerts_card.set_value(str(len(alerts)))
        self.receipts_card.set_value(
            str(sum(1 for row in receipts if str(row.get("status") or "").upper() == "DRAFT"))
        )
        self.issues_card.set_value(
            str(sum(1 for row in issues if str(row.get("status") or "").upper() == "DRAFT"))
        )
        self.movements_table.set_rows(movements)

        health = data.get("health") if isinstance(data.get("health"), dict) else {}
        status = str(health.get("status") or "unknown")
        self.header.set_subtitle(f"Inventory service: {status}")
        self.banner.show_info(f"{len(items)} item(s), {len(movements)} recent movement(s).")

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))
