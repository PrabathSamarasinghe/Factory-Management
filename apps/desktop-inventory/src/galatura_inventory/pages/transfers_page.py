"""Stock transfer drafts and approvals for the C6 client."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import ApiError, SessionManager
from galatura_desktop_core.widgets import format_date
from PySide6.QtWidgets import QLineEdit, QWidget

from ..widgets.forms import ReferenceFormDialog
from .common import decimal_text, label_for, rows_of, today_text
from .documents import DocumentPage


class TransferDialog(ReferenceFormDialog):
    def __init__(self, references: dict[str, Any], parent: QWidget | None = None) -> None:
        super().__init__("New stock transfer", references, parent)
        self.date_input = QLineEdit(today_text())
        self.from_combo = self.add_combo("From location", "locations", "name", "code")
        self.to_combo = self.add_combo("To location", "locations", "name", "code")
        self.reference_input = QLineEdit()
        self.item_combo = self.add_combo("Item", "items", "sku", "name")
        self.qty_input = QLineEdit("1")
        self.add_row("Transfer date", self.date_input)
        self.add_row("Reference", self.reference_input)
        self.add_row("Quantity", self.qty_input)

    def validate(self) -> str | None:
        try:
            if not self.date_input.text().strip():
                return "Transfer date is required."
            if not self.selected_id(self.from_combo):
                return "Select a source location."
            if not self.selected_id(self.to_combo):
                return "Select a destination location."
            if self.selected_id(self.from_combo) == self.selected_id(self.to_combo):
                return "Source and destination locations must differ."
            if not self.selected_id(self.item_combo):
                return "Select an item."
            decimal_text(self.qty_input.text(), "Quantity")
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        return {
            "transferDate": self.date_input.text().strip(),
            "fromLocationId": self.selected_id(self.from_combo),
            "toLocationId": self.selected_id(self.to_combo),
            "reference": self.reference_input.text().strip() or None,
            "lines": [
                {
                    "itemId": self.selected_id(self.item_combo),
                    "qty": decimal_text(self.qty_input.text(), "Quantity"),
                }
            ],
        }


class TransfersPage(DocumentPage):
    def __init__(self, session: SessionManager):
        super().__init__(
            session,
            title="Transfers",
            subtitle="Move stock between locations and approve the movement.",
            columns=(
                ("transferDate", "Date", 110),
                ("fromLabel", "From", 200),
                ("toLabel", "To", 200),
                ("reference", "Reference", 160),
                ("status", "Status", 110),
                ("id", "Transfer ID", 240),
            ),
            list_method="list_transfers",
            list_key="transfers",
            create_method="create_transfer",
            approve_method="approve_transfer",
            read_permission="transfer:read",
            create_permission="transfer:create",
            approve_permission="transfer:approve",
            noun="transfer",
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

    def create_dialog(self) -> TransferDialog | None:
        return TransferDialog(self.references, parent=self)

    def _format_rows(self, documents: list[dict[str, Any]]) -> None:
        locations = rows_of(self.references.get("locations"))
        by_id = {str(row.get("id") or ""): row for row in locations}

        def location_label(_value: Any, row: dict[str, Any], *keys: str) -> str:
            identifier = ""
            for key in keys:
                identifier = str(row.get(key) or "")
                if identifier:
                    break
            return label_for(by_id.get(identifier), "code", "name")

        self.table.set_formatter("transferDate", lambda value, _row: format_date(value))
        self.table.set_formatter(
            "fromLabel", lambda value, row: location_label(value, row, "fromLocationId", "from")
        )
        self.table.set_formatter(
            "toLabel", lambda value, row: location_label(value, row, "toLocationId", "to")
        )
        del documents
