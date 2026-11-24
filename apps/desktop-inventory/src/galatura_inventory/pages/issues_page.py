"""Goods issue drafts and approvals for the C6 client."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import ApiError, SessionManager
from galatura_desktop_core.widgets import format_date
from PySide6.QtWidgets import QComboBox, QLineEdit, QWidget

from ..widgets.forms import ReferenceFormDialog
from .common import decimal_text, today_text
from .documents import DocumentPage


class IssueDialog(ReferenceFormDialog):
    def __init__(self, references: dict[str, Any], parent: QWidget | None = None) -> None:
        super().__init__("New goods issue", references, parent)
        self.date_input = QLineEdit(today_text())
        self.type_combo = QComboBox()
        for label, value in (
            ("Department", "DEPARTMENT"),
            ("Supplier", "SUPPLIER"),
            ("Customer", "CUSTOMER"),
            ("Other", "OTHER"),
        ):
            self.type_combo.addItem(label, value)
        self.issued_to_input = QLineEdit()
        self.purpose_input = QLineEdit()
        self.location_combo = self.add_combo(
            "Source location", "locations", "name", "code", blank=True
        )
        self.item_combo = self.add_combo("Item", "items", "sku", "name")
        self.qty_input = QLineEdit("1")
        self.batch_input = QLineEdit()
        self.add_row("Issue date", self.date_input)
        self.add_row("Issued to type", self.type_combo)
        self.add_row("Issued to", self.issued_to_input)
        self.add_row("Purpose", self.purpose_input)
        self.add_row("Quantity", self.qty_input)
        self.add_row("Batch ID", self.batch_input)

    def validate(self) -> str | None:
        try:
            if not self.date_input.text().strip():
                return "Issue date is required."
            if not self.issued_to_input.text().strip():
                return "Issued to is required."
            if not self.selected_id(self.item_combo):
                return "Select an item."
            decimal_text(self.qty_input.text(), "Quantity")
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        line: dict[str, Any] = {
            "itemId": self.selected_id(self.item_combo),
            "qty": decimal_text(self.qty_input.text(), "Quantity"),
        }
        batch_id = self.batch_input.text().strip()
        if batch_id:
            line["batchId"] = batch_id
        payload: dict[str, Any] = {
            "issueDate": self.date_input.text().strip(),
            "issuedToType": self.type_combo.currentData(),
            "issuedToId": self.issued_to_input.text().strip(),
            "purpose": self.purpose_input.text().strip() or None,
            "lines": [line],
        }
        location_id = self.selected_id(self.location_combo)
        if location_id:
            payload["locationId"] = location_id
        return payload


class IssuesPage(DocumentPage):
    def __init__(self, session: SessionManager):
        super().__init__(
            session,
            title="Issues",
            subtitle="Record material issues and approve them after review.",
            columns=(
                ("issueDate", "Date", 110),
                ("issuedToType", "Issued to type", 150),
                ("issuedToId", "Issued to", 220),
                ("purpose", "Purpose", 200),
                ("status", "Status", 120),
                ("id", "Issue ID", 240),
            ),
            list_method="list_goods_issues",
            list_key="issues",
            create_method="create_goods_issue",
            approve_method="approve_goods_issue",
            read_permission="issue:read",
            create_permission="issue:create",
            approve_permission="issue:approve",
            noun="issue",
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

    def create_dialog(self) -> IssueDialog | None:
        return IssueDialog(self.references, parent=self)

    def _format_rows(self, documents: list[dict[str, Any]]) -> None:
        self.table.set_formatter("issueDate", lambda value, _row: format_date(value))
        del documents
