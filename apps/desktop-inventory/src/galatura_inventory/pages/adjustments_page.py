"""Stock adjustment drafts and approvals for the C6 client."""

from __future__ import annotations

from decimal import Decimal
from typing import Any

from galatura_desktop_core import ApiError, SessionManager
from galatura_desktop_core.widgets import format_date
from PySide6.QtWidgets import QLineEdit, QWidget

from ..widgets.forms import ReferenceFormDialog
from .common import decimal_text, today_text
from .documents import DocumentPage


class AdjustmentDialog(ReferenceFormDialog):
    def __init__(self, references: dict[str, Any], parent: QWidget | None = None) -> None:
        super().__init__("New stock adjustment", references, parent)
        self.date_input = QLineEdit(today_text())
        self.reason_input = QLineEdit()
        self.location_combo = self.add_combo(
            "Location", "locations", "name", "code", blank=True
        )
        self.item_combo = self.add_combo("Item", "items", "sku", "name")
        self.qty_input = QLineEdit("0")
        self.qty_input.setPlaceholderText("Use a negative quantity to reduce stock")
        self.add_row("Adjustment date", self.date_input)
        self.add_row("Reason", self.reason_input)
        self.add_row("Quantity change", self.qty_input)

    def validate(self) -> str | None:
        try:
            if not self.date_input.text().strip():
                return "Adjustment date is required."
            if not self.reason_input.text().strip():
                return "A reason is required."
            if not self.selected_id(self.item_combo):
                return "Select an item."
            quantity = decimal_text(self.qty_input.text(), "Quantity change", allow_negative=True)
            if Decimal(quantity) == 0:
                return "Quantity change cannot be zero."
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "adjustmentDate": self.date_input.text().strip(),
            "reason": self.reason_input.text().strip(),
            "lines": [
                {
                    "itemId": self.selected_id(self.item_combo),
                    "qty": decimal_text(
                        self.qty_input.text(),
                        "Quantity change",
                        allow_negative=True,
                    ),
                }
            ],
        }
        location_id = self.selected_id(self.location_combo)
        if location_id:
            payload["locationId"] = location_id
        return payload


class AdjustmentsPage(DocumentPage):
    def __init__(self, session: SessionManager):
        super().__init__(
            session,
            title="Adjustments",
            subtitle="Correct stock counts with a reason and a second-person approval.",
            columns=(
                ("adjustmentDate", "Date", 110),
                ("reason", "Reason", 300),
                ("status", "Status", 120),
                ("id", "Adjustment ID", 300),
            ),
            list_method="list_adjustments",
            list_key="adjustments",
            create_method="create_adjustment",
            approve_method="approve_adjustment",
            read_permission=None,
            create_permission="adjustment:create",
            approve_permission="adjustment:approve",
            noun="adjustment",
        )

    def load_references(self) -> dict[str, Any]:
        result: dict[str, Any] = {}
        inventory = self.session.inventory
        for key, method in (
            ("items", inventory.list_items),
            ("locations", inventory.list_locations),
        ):
            try:
                result[key] = method() or []
            except ApiError:
                result[key] = []
        return result

    def create_dialog(self) -> AdjustmentDialog | None:
        return AdjustmentDialog(self.references, parent=self)

    def _format_rows(self, documents: list[dict[str, Any]]) -> None:
        self.table.set_formatter("adjustmentDate", lambda value, _row: format_date(value))
        del documents
