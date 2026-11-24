"""Goods receipt drafts and approvals for the C6 client."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import ApiError, SessionManager
from galatura_desktop_core.widgets import format_date
from PySide6.QtWidgets import QLineEdit, QWidget

from ..widgets.forms import ReferenceFormDialog
from .common import decimal_text, rows_of, today_text
from .documents import DocumentPage


class ReceiptDialog(ReferenceFormDialog):
    def __init__(self, references: dict[str, Any], parent: QWidget | None = None) -> None:
        super().__init__("New goods receipt", references, parent)
        self.vendor_combo = self.add_combo("Vendor", "vendors", "name", "id")
        self.date_input = QLineEdit(today_text())
        self.reference_input = QLineEdit()
        self.location_combo = self.add_combo(
            "Destination location", "locations", "name", "code", blank=True
        )
        self.item_combo = self.add_combo("Item", "items", "sku", "name")
        self.qty_input = QLineEdit("1")
        self.cost_input = QLineEdit("0")
        self.batch_input = QLineEdit()
        self.expiry_input = QLineEdit()
        self.expiry_input.setPlaceholderText("YYYY-MM-DD (optional)")
        self.add_row("Receipt date", self.date_input)
        self.add_row("Reference", self.reference_input)
        self.add_row("Quantity", self.qty_input)
        self.add_row("Unit cost", self.cost_input)
        self.add_row("Batch no", self.batch_input)
        self.add_row("Expiry date", self.expiry_input)

    def validate(self) -> str | None:
        try:
            if not self.selected_id(self.vendor_combo):
                return "Select a vendor."
            if not self.date_input.text().strip():
                return "Receipt date is required."
            if not self.selected_id(self.item_combo):
                return "Select an item."
            decimal_text(self.qty_input.text(), "Quantity")
            decimal_text(self.cost_input.text(), "Unit cost")
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        line: dict[str, Any] = {
            "itemId": self.selected_id(self.item_combo),
            "qty": decimal_text(self.qty_input.text(), "Quantity"),
            "unitCost": decimal_text(self.cost_input.text(), "Unit cost"),
        }
        for key, value in (
            ("batchNo", self.batch_input.text()),
            ("expiryDate", self.expiry_input.text()),
        ):
            if value.strip():
                line[key] = value.strip()
        payload: dict[str, Any] = {
            "vendorId": self.selected_id(self.vendor_combo),
            "receiptDate": self.date_input.text().strip(),
            "reference": self.reference_input.text().strip() or None,
            "lines": [line],
        }
        location_id = self.selected_id(self.location_combo)
        if location_id:
            payload["locationId"] = location_id
        return payload


class ReceiptsPage(DocumentPage):
    def __init__(self, session: SessionManager):
        super().__init__(
            session,
            title="Receipts",
            subtitle="Draft supplier receipts and approve them into stock.",
            columns=(
                ("receiptDate", "Date", 110),
                ("vendorLabel", "Vendor", 220),
                ("reference", "Reference", 180),
                ("status", "Status", 120),
                ("id", "Receipt ID", 260),
            ),
            list_method="list_goods_receipts",
            list_key="receipts",
            create_method="create_goods_receipt",
            approve_method="approve_goods_receipt",
            read_permission="receipt:read",
            create_permission="receipt:create",
            approve_permission="receipt:approve",
            noun="receipt",
        )

    def load_references(self) -> dict[str, Any]:
        result: dict[str, Any] = {}
        inventory = self.session.inventory
        for key, method in (
            ("vendors", inventory.list_vendors),
            ("items", inventory.list_items),
            ("locations", inventory.list_locations),
        ):
            try:
                result[key] = method() or []
            except ApiError:
                result[key] = []
        return result

    def create_dialog(self) -> ReceiptDialog | None:
        return ReceiptDialog(self.references, parent=self)

    def _format_rows(self, documents: list[dict[str, Any]]) -> None:
        vendors = rows_of(self.references.get("vendors"))
        vendor_names = {str(row.get("id") or ""): row.get("name") for row in vendors}
        self.table.set_formatter("receiptDate", lambda value, _row: format_date(value))
        self.table.set_formatter(
            "vendorLabel",
            lambda _value, row: str(vendor_names.get(str(row.get("vendorId") or ""), "-")),
        )
        del documents
