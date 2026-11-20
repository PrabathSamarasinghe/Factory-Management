"""Supplier bills, payables, rates and supplier adjustments."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from galatura_desktop_core import SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    FormDialog,
    PageHeader,
    StatusBanner,
    confirm,
    format_date,
    format_money,
    ghost_button,
    primary_button,
    run_async,
)
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QVBoxLayout,
    QWidget,
)

from .common import (
    details_of,
    money_text,
    required_text,
    row_id,
    rows_of,
    today_text,
    value_text,
)


class GenerateBillsDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("Generate supplier bills", parent)
        self.supplier_input = QLineEdit()
        self.supplier_input.setPlaceholderText("Optional supplier ID")
        self.from_input = QLineEdit(today_text())
        self.to_input = QLineEdit(today_text())
        self.grade_input = QLineEdit()
        self.grade_input.setPlaceholderText("Optional grade")
        self.add_row("Supplier ID", self.supplier_input)
        self.add_row("From date", self.from_input)
        self.add_row("To date", self.to_input)
        self.add_row("Grade", self.grade_input)

    def validate(self) -> str | None:
        try:
            required_text(self.from_input.text(), "From date")
            required_text(self.to_input.text(), "To date")
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "fromDate": self.from_input.text().strip(),
            "toDate": self.to_input.text().strip(),
        }
        supplier = self.supplier_input.text().strip()
        grade = self.grade_input.text().strip()
        if supplier:
            payload["supplierId"] = supplier
        if grade:
            payload["grade"] = grade
        return payload


class AdjustmentDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("New supplier adjustment", parent)
        self.supplier_input = QLineEdit()
        self.type_input = QLineEdit()
        self.amount_input = QLineEdit()
        self.date_input = QLineEdit(today_text())
        self.description_input = QLineEdit()
        self.add_row("Supplier ID", self.supplier_input)
        self.add_row("Adjustment type", self.type_input)
        self.add_row("Amount", self.amount_input)
        self.add_row("Adjustment date", self.date_input)
        self.add_row("Description", self.description_input)

    def validate(self) -> str | None:
        try:
            required_text(self.supplier_input.text(), "Supplier ID")
            required_text(self.type_input.text(), "Adjustment type")
            required_text(self.date_input.text(), "Adjustment date")
            money_text(self.amount_input.text(), "Amount")
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "supplierId": self.supplier_input.text().strip(),
            "adjustmentType": self.type_input.text().strip(),
            "amount": money_text(self.amount_input.text(), "Amount"),
            "adjustmentDate": self.date_input.text().strip(),
        }
        description = self.description_input.text().strip()
        if description:
            payload["description"] = description
        return payload


class RecoverDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("Recover adjustment", parent)
        self.amount_input = QLineEdit()
        self.amount_input.setPlaceholderText("Leave blank for the full amount")
        self.add_row("Amount", self.amount_input)

    def validate(self) -> str | None:
        if not self.amount_input.text().strip():
            return None
        try:
            money_text(self.amount_input.text(), "Amount")
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        if not self.amount_input.text().strip():
            return {}
        return {"amount": money_text(self.amount_input.text(), "Amount")}


class RateDialog(FormDialog):
    def __init__(self, rate: dict[str, Any] | None = None, parent: QWidget | None = None) -> None:
        super().__init__("Rate" if rate else "New rate", parent)
        rate = rate or {}
        self.grade_input = QLineEdit(str(rate.get("grade") or ""))
        self.rate_input = QLineEdit(str(rate.get("ratePerKg") or ""))
        self.from_input = QLineEdit(str(rate.get("effectiveFrom") or today_text()))
        self.to_input = QLineEdit(str(rate.get("effectiveTo") or ""))
        self.approver_input = QLineEdit(str(rate.get("approver") or ""))
        self.add_row("Grade", self.grade_input)
        self.add_row("Rate per kg", self.rate_input)
        self.add_row("Effective from", self.from_input)
        self.add_row("Effective to", self.to_input)
        self.add_row("Approver", self.approver_input)

    def validate(self) -> str | None:
        try:
            required_text(self.grade_input.text(), "Grade")
            required_text(self.from_input.text(), "Effective from")
            money_text(self.rate_input.text(), "Rate per kg")
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "grade": self.grade_input.text().strip(),
            "ratePerKg": money_text(self.rate_input.text(), "Rate per kg"),
            "effectiveFrom": self.from_input.text().strip(),
        }
        effective_to = self.to_input.text().strip()
        approver = self.approver_input.text().strip()
        if effective_to:
            payload["effectiveTo"] = effective_to
        if approver:
            payload["approver"] = approver
        return payload


class BillsPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(12)

        header = PageHeader(
            "Bills & Payables",
            "Generate and approve supplier bills, review payables and maintain rates.",
        )
        self.refresh_button = ghost_button("Refresh")
        self.refresh_button.clicked.connect(self.refresh)
        header.add_action(self.refresh_button)
        layout.addWidget(header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        bills_frame = QFrame()
        bills_frame.setObjectName("Panel")
        bills_layout = QVBoxLayout(bills_frame)
        bills_layout.setContentsMargins(18, 16, 18, 16)
        bills_layout.setSpacing(8)
        bills_title = QLabel("Supplier bills")
        bills_title.setObjectName("PageTitle")
        bills_title.setStyleSheet("font-size: 12pt;")
        bills_layout.addWidget(bills_title)

        self.bills_table = DataTable(
            [
                ("supplierId", "Supplier", 200),
                ("fromDate", "From", 110),
                ("toDate", "To", 110),
                ("totalAmount", "Amount", 140),
                ("status", "Status", 110),
                ("id", "Bill ID", 220),
            ]
        )
        self.bills_table.set_formatter("fromDate", lambda value, _row: format_date(value))
        self.bills_table.set_formatter("toDate", lambda value, _row: format_date(value))
        self.bills_table.set_formatter("totalAmount", lambda value, _row: format_money(value))
        bills_layout.addWidget(self.bills_table, 1)

        bills_actions = QHBoxLayout()
        self.generate_button = primary_button("Generate bills")
        self.generate_button.clicked.connect(self.generate_bills)
        self.approve_bill_button = primary_button("Approve selected")
        self.approve_bill_button.clicked.connect(self.approve_bill)
        bills_actions.addWidget(self.generate_button)
        bills_actions.addWidget(self.approve_bill_button)
        bills_actions.addStretch(1)
        bills_layout.addLayout(bills_actions)
        layout.addWidget(bills_frame, 2)

        payable_frame = QFrame()
        payable_frame.setObjectName("Panel")
        payable_layout = QVBoxLayout(payable_frame)
        payable_layout.setContentsMargins(18, 16, 18, 16)
        payable_layout.setSpacing(8)
        payable_title = QLabel("Payables and aging")
        payable_title.setObjectName("PageTitle")
        payable_title.setStyleSheet("font-size: 12pt;")
        payable_layout.addWidget(payable_title)

        payable_filters = QHBoxLayout()
        payable_filters.addWidget(QLabel("Supplier ID"))
        self.supplier_input = QLineEdit()
        self.supplier_input.setMaximumWidth(240)
        payable_filters.addWidget(self.supplier_input)
        payable_filters.addWidget(QLabel("As of"))
        self.as_of_input = QLineEdit(today_text())
        self.as_of_input.setMaximumWidth(140)
        payable_filters.addWidget(self.as_of_input)
        self.payable_button = primary_button("Load payable")
        self.payable_button.clicked.connect(self.load_payable)
        payable_filters.addWidget(self.payable_button)
        payable_filters.addStretch(1)
        payable_layout.addLayout(payable_filters)

        self.payable_label = QLabel("Payable: -")
        self.payable_label.setObjectName("Subtitle")
        payable_layout.addWidget(self.payable_label)
        self.aging_table = DataTable(
            [
                ("label", "Supplier", 220),
                ("values", "Aging buckets", 420),
                ("id", "ID", 200),
            ]
        )
        payable_layout.addWidget(self.aging_table, 1)
        layout.addWidget(payable_frame, 2)

        bottom = QHBoxLayout()
        bottom.setSpacing(12)

        rates_frame = QFrame()
        rates_frame.setObjectName("Panel")
        rates_layout = QVBoxLayout(rates_frame)
        rates_layout.setContentsMargins(18, 16, 18, 16)
        rates_layout.setSpacing(8)
        rates_title = QLabel("Rates")
        rates_title.setObjectName("PageTitle")
        rates_title.setStyleSheet("font-size: 12pt;")
        rates_layout.addWidget(rates_title)
        self.rates_table = DataTable(
            [
                ("grade", "Grade", 140),
                ("ratePerKg", "Rate / kg", 130),
                ("effectiveFrom", "From", 110),
                ("effectiveTo", "To", 110),
                ("approver", "Approver", 160),
                ("id", "ID", 200),
            ]
        )
        self.rates_table.set_formatter("ratePerKg", lambda value, _row: format_money(value))
        rates_layout.addWidget(self.rates_table, 1)
        rate_actions = QHBoxLayout()
        self.new_rate_button = primary_button("New rate")
        self.new_rate_button.clicked.connect(self.create_rate)
        self.edit_rate_button = primary_button("Edit selected")
        self.edit_rate_button.clicked.connect(self.edit_rate)
        rate_actions.addWidget(self.new_rate_button)
        rate_actions.addWidget(self.edit_rate_button)
        rate_actions.addStretch(1)
        rates_layout.addLayout(rate_actions)
        bottom.addWidget(rates_frame, 1)

        adjustments_frame = QFrame()
        adjustments_frame.setObjectName("Panel")
        adjustments_layout = QVBoxLayout(adjustments_frame)
        adjustments_layout.setContentsMargins(18, 16, 18, 16)
        adjustments_layout.setSpacing(8)
        adjustments_title = QLabel("Supplier adjustments")
        adjustments_title.setObjectName("PageTitle")
        adjustments_title.setStyleSheet("font-size: 12pt;")
        adjustments_layout.addWidget(adjustments_title)
        self.adjustments_table = DataTable(
            [
                ("supplierId", "Supplier", 180),
                ("adjustmentType", "Type", 150),
                ("amount", "Amount", 130),
                ("adjustmentDate", "Date", 110),
                ("status", "Status", 110),
                ("id", "ID", 200),
            ]
        )
        self.adjustments_table.set_formatter("amount", lambda value, _row: format_money(value))
        adjustments_layout.addWidget(self.adjustments_table, 1)
        adjustment_actions = QHBoxLayout()
        self.new_adjustment_button = primary_button("New adjustment")
        self.new_adjustment_button.clicked.connect(self.create_adjustment)
        self.recover_button = primary_button("Recover selected")
        self.recover_button.clicked.connect(self.recover_adjustment)
        adjustment_actions.addWidget(self.new_adjustment_button)
        adjustment_actions.addWidget(self.recover_button)
        adjustment_actions.addStretch(1)
        adjustments_layout.addLayout(adjustment_actions)
        bottom.addWidget(adjustments_frame, 1)

        layout.addLayout(bottom, 2)
        self._update_actions()

    def refresh(self) -> None:
        self.banner.clear()
        if not self.session.has_permission("payable:read"):
            self.banner.show_error("Your role does not include payable:read.")
            return
        run_async(self._load, self._apply, self._on_error)

    def _load(self) -> dict[str, Any]:
        bills = self.session.accounts.list_supplier_bills() or []
        adjustments = self.session.accounts.list_supplier_adjustments() or []
        aging = self.session.accounts.supplier_aging(as_of=today_text())
        rates: list[dict[str, Any]] = []
        if self.session.has_permission("rate:read"):
            rates = self.session.accounts.list_rates() or []
        return {"bills": bills, "adjustments": adjustments, "aging": aging, "rates": rates}

    def _apply(self, data: dict[str, Any]) -> None:
        self.bills_table.set_rows(rows_of(data.get("bills"), "bills", "data"))
        self.adjustments_table.set_rows(rows_of(data.get("adjustments"), "adjustments", "data"))
        self.rates_table.set_rows(rows_of(data.get("rates"), "rates", "data"))
        aging_rows: list[dict[str, Any]] = []
        for row in rows_of(data.get("aging"), "rows", "suppliers", "data"):
            aging_rows.append(
                {
                    **row,
                    "label": row.get("label") or row.get("name") or row.get("supplierName") or "-",
                    "values": value_text(row),
                }
            )
        self.aging_table.set_rows(aging_rows)
        self._update_actions()
        self.banner.show_info(
            f"{self.bills_table.rowCount()} bill(s), "
            f"{self.adjustments_table.rowCount()} adjustment(s)."
        )

    def _update_actions(self) -> None:
        can_write_rate = self.session.has_permission("rate:write")
        can_write_bill = self.session.has_permission("bill:approve")
        self.generate_button.setEnabled(self.session.has_permission("bill:generate"))
        self.approve_bill_button.setEnabled(
            can_write_bill and self.bills_table.selected_row() is not None
        )
        self.payable_button.setEnabled(self.session.has_permission("payable:read"))
        self.new_rate_button.setEnabled(can_write_rate)
        self.edit_rate_button.setEnabled(
            can_write_rate and self.rates_table.selected_row() is not None
        )
        self.new_adjustment_button.setEnabled(can_write_bill)
        self.recover_button.setEnabled(
            can_write_bill and self.adjustments_table.selected_row() is not None
        )

    def load_payable(self) -> None:
        if not self.session.has_permission("payable:read"):
            self.banner.show_error("Your role cannot read payables.")
            return
        supplier_id = self.supplier_input.text().strip()
        if not supplier_id:
            self.banner.show_info("Enter a supplier ID first.")
            return
        run_async(
            lambda: self.session.accounts.supplier_payable(
                supplier_id,
                as_of=self.as_of_input.text().strip() or None,
            ),
            self._apply_payable,
            self._on_error,
        )

    def _apply_payable(self, data: Any) -> None:
        info = details_of(data, "payable", "data")
        amount = info.get("amount") or info.get("balance") or info.get("payable")
        as_of = info.get("asOf") or "-"
        self.payable_label.setText(f"Payable: {format_money(amount)} | As of: {as_of}")

    def generate_bills(self) -> None:
        if not self.session.has_permission("bill:generate"):
            self.banner.show_error("Your role cannot generate supplier bills.")
            return
        dialog = GenerateBillsDialog(self)
        if not dialog.exec():
            return
        payload = dialog.payload
        key = str(uuid4())
        run_async(
            lambda: self.session.accounts.generate_supplier_bills(payload, key),
            lambda _result: self._on_success("Supplier bills generated."),
            self._on_error,
        )

    def approve_bill(self) -> None:
        if not self.session.has_permission("bill:approve"):
            self.banner.show_error("Your role cannot approve supplier bills.")
            return
        selected = self.bills_table.selected_row()
        if not selected:
            self.banner.show_info("Select a bill first.")
            return
        if not confirm(self, "Approve bill", "Approve and post this supplier bill?"):
            return
        bill_id = row_id(selected)
        key = str(uuid4())
        run_async(
            lambda: self.session.accounts.approve_supplier_bill(bill_id, key),
            lambda _result: self._on_success("Supplier bill approved."),
            self._on_error,
        )

    def create_adjustment(self) -> None:
        if not self.session.has_permission("bill:approve"):
            self.banner.show_error("Your role cannot change supplier adjustments.")
            return
        dialog = AdjustmentDialog(self)
        if not dialog.exec():
            return
        payload = dialog.payload
        run_async(
            lambda: self.session.accounts.create_supplier_adjustment(payload),
            lambda _result: self._on_success("Supplier adjustment created."),
            self._on_error,
        )

    def recover_adjustment(self) -> None:
        if not self.session.has_permission("bill:approve"):
            self.banner.show_error("Your role cannot recover adjustments.")
            return
        selected = self.adjustments_table.selected_row()
        if not selected:
            self.banner.show_info("Select an adjustment first.")
            return
        dialog = RecoverDialog(self)
        if not dialog.exec():
            return
        amount = dialog.payload.get("amount")
        adjustment_id = row_id(selected)
        key = str(uuid4())
        run_async(
            lambda: self.session.accounts.recover_supplier_adjustment(
                adjustment_id,
                amount=amount,
                idempotency_key=key,
            ),
            lambda _result: self._on_success("Adjustment recovery requested."),
            self._on_error,
        )

    def create_rate(self) -> None:
        if not self.session.has_permission("rate:write"):
            self.banner.show_error("Your role cannot change rates.")
            return
        dialog = RateDialog(parent=self)
        if not dialog.exec():
            return
        payload = dialog.payload
        run_async(
            lambda: self.session.accounts.create_rate(payload),
            lambda _result: self._on_success("Rate created."),
            self._on_error,
        )

    def edit_rate(self) -> None:
        if not self.session.has_permission("rate:write"):
            self.banner.show_error("Your role cannot change rates.")
            return
        selected = self.rates_table.selected_row()
        if not selected:
            self.banner.show_info("Select a rate first.")
            return
        dialog = RateDialog(selected, self)
        if not dialog.exec():
            return
        rate_id = row_id(selected)
        payload = dialog.payload
        run_async(
            lambda: self.session.accounts.update_rate(rate_id, payload),
            lambda _result: self._on_success("Rate updated."),
            self._on_error,
        )

    def _on_success(self, message: str) -> None:
        self.banner.show_success(message)
        self.refresh()

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))
