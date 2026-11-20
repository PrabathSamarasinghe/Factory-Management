"""Payment batches, payments, bank files and paid status."""

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
    QComboBox,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QVBoxLayout,
    QWidget,
)

from .common import money_text, required_text, row_id, rows_of, save_export, today_text


def _method_combo() -> QComboBox:
    combo = QComboBox()
    for label, value in (
        ("Bank transfer", "BANK_TRANSFER"),
        ("Cash", "CASH"),
        ("Cheque", "CHEQUE"),
        ("Other", "OTHER"),
    ):
        combo.addItem(label, value)
    return combo


class BatchDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("New payment batch", parent)
        self.type_input = QLineEdit()
        self.method_combo = _method_combo()
        self.amount_input = QLineEdit()
        self.reference_input = QLineEdit()
        self.add_row("Batch type", self.type_input)
        self.add_row("Payment method", self.method_combo)
        self.add_row("Total amount", self.amount_input)
        self.add_row("Reference", self.reference_input)

    def validate(self) -> str | None:
        try:
            required_text(self.type_input.text(), "Batch type")
            money_text(self.amount_input.text(), "Total amount")
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "batchType": self.type_input.text().strip(),
            "paymentMethod": self.method_combo.currentData(),
            "totalAmount": money_text(self.amount_input.text(), "Total amount"),
        }
        reference = self.reference_input.text().strip()
        if reference:
            payload["reference"] = reference
        return payload


class PaymentDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("New payment", parent)
        self.payee_type = QComboBox()
        for label, value in (
            ("Supplier", "SUPPLIER"),
            ("Employee", "EMPLOYEE"),
            ("Other", "OTHER"),
        ):
            self.payee_type.addItem(label, value)
        self.payee_input = QLineEdit()
        self.amount_input = QLineEdit()
        self.method_combo = _method_combo()
        self.reference_input = QLineEdit()
        self.bill_input = QLineEdit()
        self.item_input = QLineEdit()
        self.add_row("Payee type", self.payee_type)
        self.add_row("Payee ID", self.payee_input)
        self.add_row("Amount", self.amount_input)
        self.add_row("Payment method", self.method_combo)
        self.add_row("Reference", self.reference_input)
        self.add_row("Bill ID", self.bill_input)
        self.add_row("Payroll item ID", self.item_input)

    def validate(self) -> str | None:
        try:
            required_text(self.payee_input.text(), "Payee ID")
            money_text(self.amount_input.text(), "Amount")
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "payeeType": self.payee_type.currentData(),
            "payeeId": self.payee_input.text().strip(),
            "amount": money_text(self.amount_input.text(), "Amount"),
            "paymentMethod": self.method_combo.currentData(),
        }
        for key, widget in (
            ("reference", self.reference_input),
            ("billId", self.bill_input),
            ("payrollItemId", self.item_input),
        ):
            value = widget.text().strip()
            if value:
                payload[key] = value
        return payload


class MarkPaidDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("Mark payment paid", parent)
        self.date_input = QLineEdit(today_text())
        self.reference_input = QLineEdit()
        self.add_row("Paid date", self.date_input)
        self.add_row("Reference", self.reference_input)

    def validate(self) -> str | None:
        try:
            required_text(self.date_input.text(), "Paid date")
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"paidDate": self.date_input.text().strip()}
        reference = self.reference_input.text().strip()
        if reference:
            payload["reference"] = reference
        return payload


class PaymentsPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(12)

        header = PageHeader(
            "Payments",
            "Build payment batches, export bank files and record settled payments.",
        )
        self.refresh_button = ghost_button("Refresh")
        self.refresh_button.clicked.connect(self.refresh)
        header.add_action(self.refresh_button)
        layout.addWidget(header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        batches_frame = QFrame()
        batches_frame.setObjectName("Panel")
        batches_layout = QVBoxLayout(batches_frame)
        batches_layout.setContentsMargins(18, 16, 18, 16)
        batches_layout.setSpacing(8)
        batches_title = QLabel("Payment batches")
        batches_title.setObjectName("PageTitle")
        batches_title.setStyleSheet("font-size: 12pt;")
        batches_layout.addWidget(batches_title)

        self.batches_table = DataTable(
            [
                ("batchType", "Type", 150),
                ("paymentMethod", "Method", 140),
                ("totalAmount", "Amount", 140),
                ("status", "Status", 120),
                ("reference", "Reference", 180),
                ("id", "Batch ID", 220),
            ]
        )
        self.batches_table.set_formatter("totalAmount", lambda value, _row: format_money(value))
        batches_layout.addWidget(self.batches_table, 1)
        batch_actions = QHBoxLayout()
        self.new_batch_button = primary_button("New batch")
        self.new_batch_button.clicked.connect(self.create_batch)
        self.approve_batch_button = primary_button("Approve batch")
        self.approve_batch_button.clicked.connect(self.approve_batch)
        self.bank_file_button = primary_button("Download bank file")
        self.bank_file_button.clicked.connect(self.download_bank_file)
        for button in (self.new_batch_button, self.approve_batch_button, self.bank_file_button):
            batch_actions.addWidget(button)
        batch_actions.addStretch(1)
        batches_layout.addLayout(batch_actions)
        layout.addWidget(batches_frame, 1)

        payments_frame = QFrame()
        payments_frame.setObjectName("Panel")
        payments_layout = QVBoxLayout(payments_frame)
        payments_layout.setContentsMargins(18, 16, 18, 16)
        payments_layout.setSpacing(8)
        payments_title = QLabel("Payments")
        payments_title.setObjectName("PageTitle")
        payments_title.setStyleSheet("font-size: 12pt;")
        payments_layout.addWidget(payments_title)

        self.payments_table = DataTable(
            [
                ("paymentDate", "Date", 110),
                ("payeeType", "Payee type", 130),
                ("payeeId", "Payee", 200),
                ("amount", "Amount", 140),
                ("paymentMethod", "Method", 140),
                ("status", "Status", 120),
                ("id", "Payment ID", 220),
            ]
        )
        self.payments_table.set_formatter("paymentDate", lambda value, _row: format_date(value))
        self.payments_table.set_formatter("amount", lambda value, _row: format_money(value))
        payments_layout.addWidget(self.payments_table, 1)
        payment_actions = QHBoxLayout()
        self.new_payment_button = primary_button("New payment")
        self.new_payment_button.clicked.connect(self.create_payment)
        self.mark_paid_button = primary_button("Mark paid")
        self.mark_paid_button.clicked.connect(self.mark_paid)
        payment_actions.addWidget(self.new_payment_button)
        payment_actions.addWidget(self.mark_paid_button)
        payment_actions.addStretch(1)
        payments_layout.addLayout(payment_actions)
        layout.addWidget(payments_frame, 1)

        self._update_actions()

    def refresh(self) -> None:
        self.banner.clear()
        if not self.session.has_permission("payment:create"):
            self.banner.show_error("Your role does not include payment:create.")
            return
        run_async(self._load, self._apply, self._on_error)

    def _load(self) -> dict[str, Any]:
        batches = self.session.accounts.list_payment_batches() or []
        payments = self.session.accounts.list_payments() or []
        return {"batches": batches, "payments": payments}

    def _apply(self, data: dict[str, Any]) -> None:
        self.batches_table.set_rows(rows_of(data.get("batches"), "batches", "data"))
        self.payments_table.set_rows(rows_of(data.get("payments"), "payments", "data"))
        self._update_actions()
        self.banner.show_info(
            f"{self.batches_table.rowCount()} batch(es), "
            f"{self.payments_table.rowCount()} payment(s)."
        )

    def _update_actions(self) -> None:
        batch = self.batches_table.selected_row()
        payment = self.payments_table.selected_row()
        self.new_batch_button.setEnabled(self.session.has_permission("payment:create"))
        self.approve_batch_button.setEnabled(
            self.session.has_permission("payment:approve") and batch is not None
        )
        self.bank_file_button.setEnabled(
            self.session.has_permission("payment:export") and batch is not None
        )
        self.new_payment_button.setEnabled(self.session.has_permission("payment:create"))
        self.mark_paid_button.setEnabled(
            self.session.has_permission("payment:mark-paid") and payment is not None
        )

    def create_batch(self) -> None:
        if not self.session.has_permission("payment:create"):
            self.banner.show_error("Your role cannot create payment batches.")
            return
        dialog = BatchDialog(self)
        if not dialog.exec():
            return
        payload = dialog.payload
        run_async(
            lambda: self.session.accounts.create_payment_batch(payload),
            lambda _result: self._on_success("Payment batch created."),
            self._on_error,
        )

    def approve_batch(self) -> None:
        if not self.session.has_permission("payment:approve"):
            self.banner.show_error("Your role cannot approve payment batches.")
            return
        selected = self.batches_table.selected_row()
        if not selected:
            self.banner.show_info("Select a batch first.")
            return
        if not confirm(self, "Approve batch", "Approve this payment batch?"):
            return
        batch_id = row_id(selected)
        key = str(uuid4())
        run_async(
            lambda: self.session.accounts.approve_payment_batch(batch_id, key),
            lambda _result: self._on_success("Payment batch approved."),
            self._on_error,
        )

    def download_bank_file(self) -> None:
        if not self.session.has_permission("payment:export"):
            self.banner.show_error("Your role cannot export bank files.")
            return
        selected = self.batches_table.selected_row()
        if not selected:
            self.banner.show_info("Select a batch first.")
            return
        batch_id = row_id(selected)
        run_async(
            lambda: self.session.accounts.payment_batch_bank_file(batch_id),
            lambda result: self._on_bank_file(result, batch_id),
            self._on_error,
        )

    def _on_bank_file(self, result: Any, batch_id: str) -> None:
        if save_export(self, f"bank-file-{batch_id[:8]}.csv", result, "csv"):
            self.banner.show_success("Bank file saved.")

    def create_payment(self) -> None:
        if not self.session.has_permission("payment:create"):
            self.banner.show_error("Your role cannot create payments.")
            return
        dialog = PaymentDialog(self)
        if not dialog.exec():
            return
        payload = dialog.payload
        key = str(uuid4())
        run_async(
            lambda: self.session.accounts.create_payment(payload, key),
            lambda _result: self._on_success("Payment created."),
            self._on_error,
        )

    def mark_paid(self) -> None:
        if not self.session.has_permission("payment:mark-paid"):
            self.banner.show_error("Your role cannot mark payments paid.")
            return
        selected = self.payments_table.selected_row()
        if not selected:
            self.banner.show_info("Select a payment first.")
            return
        dialog = MarkPaidDialog(self)
        if not dialog.exec():
            return
        payment_id = row_id(selected)
        payload = dialog.payload
        key = str(uuid4())
        run_async(
            lambda: self.session.accounts.mark_payment_paid(
                payment_id,
                paid_date=payload["paidDate"],
                reference=payload.get("reference"),
                idempotency_key=key,
            ),
            lambda _result: self._on_success("Payment marked paid."),
            self._on_error,
        )

    def _on_success(self, message: str) -> None:
        self.banner.show_success(message)
        self.refresh()

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))
