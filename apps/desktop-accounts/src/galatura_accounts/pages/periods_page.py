"""Period lock/close and bank reconciliation controls."""

from __future__ import annotations

from typing import Any

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

from .common import money_text, required_text, row_id, rows_of, today_text


class BankAccountDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("New bank account", parent)
        self.bank_input = QLineEdit()
        self.number_input = QLineEdit()
        self.ledger_input = QLineEdit()
        self.branch_input = QLineEdit()
        self.add_row("Bank name", self.bank_input)
        self.add_row("Account number (encrypted)", self.number_input)
        self.add_row("Ledger account ID", self.ledger_input)
        self.add_row("Branch", self.branch_input)

    def validate(self) -> str | None:
        try:
            required_text(self.bank_input.text(), "Bank name")
            required_text(self.number_input.text(), "Account number")
            required_text(self.ledger_input.text(), "Ledger account ID")
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "bankName": self.bank_input.text().strip(),
            "accountNumberEnc": self.number_input.text().strip(),
            "ledgerAccountId": self.ledger_input.text().strip(),
        }
        branch = self.branch_input.text().strip()
        if branch:
            payload["branch"] = branch
        return payload


class ReconciliationDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("New reconciliation", parent)
        self.bank_input = QLineEdit()
        self.date_input = QLineEdit(today_text())
        self.balance_input = QLineEdit()
        self.add_row("Bank account ID", self.bank_input)
        self.add_row("Statement date", self.date_input)
        self.add_row("Statement balance", self.balance_input)

    def validate(self) -> str | None:
        try:
            required_text(self.bank_input.text(), "Bank account ID")
            required_text(self.date_input.text(), "Statement date")
            money_text(self.balance_input.text(), "Statement balance")
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        return {
            "bankAccountId": self.bank_input.text().strip(),
            "statementDate": self.date_input.text().strip(),
            "statementBalance": money_text(self.balance_input.text(), "Statement balance"),
        }


class ReconLineDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("Add statement line", parent)
        self.date_input = QLineEdit(today_text())
        self.description_input = QLineEdit()
        self.amount_input = QLineEdit()
        self.direction_combo = QComboBox()
        self.direction_combo.addItem("Debit", "DEBIT")
        self.direction_combo.addItem("Credit", "CREDIT")
        self.add_row("Statement line date", self.date_input)
        self.add_row("Description", self.description_input)
        self.add_row("Amount", self.amount_input)
        self.add_row("Direction", self.direction_combo)

    def validate(self) -> str | None:
        try:
            required_text(self.date_input.text(), "Statement line date")
            required_text(self.description_input.text(), "Description")
            money_text(self.amount_input.text(), "Amount")
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        return {
            "statementLineDate": self.date_input.text().strip(),
            "description": self.description_input.text().strip(),
            "amount": money_text(self.amount_input.text(), "Amount"),
            "direction": self.direction_combo.currentData(),
        }


class MatchDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("Match statement line", parent)
        self.line_input = QLineEdit()
        self.journal_input = QLineEdit()
        self.add_row("Statement line ID", self.line_input)
        self.add_row("Journal line ID", self.journal_input)

    def validate(self) -> str | None:
        try:
            required_text(self.line_input.text(), "Statement line ID")
            required_text(self.journal_input.text(), "Journal line ID")
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        return {
            "lineId": self.line_input.text().strip(),
            "journalLineId": self.journal_input.text().strip(),
        }


class PeriodsPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(12)

        header = PageHeader(
            "Periods & Reconciliation",
            "Lock and close accounting periods, then reconcile bank statements.",
        )
        self.refresh_button = ghost_button("Refresh")
        self.refresh_button.clicked.connect(self.refresh)
        header.add_action(self.refresh_button)
        layout.addWidget(header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        periods_frame = QFrame()
        periods_frame.setObjectName("Panel")
        periods_layout = QVBoxLayout(periods_frame)
        periods_layout.setContentsMargins(18, 16, 18, 16)
        periods_layout.setSpacing(8)
        periods_title = QLabel("Fiscal periods")
        periods_title.setObjectName("PageTitle")
        periods_title.setStyleSheet("font-size: 12pt;")
        periods_layout.addWidget(periods_title)
        self.periods_table = DataTable(
            [
                ("name", "Period", 220),
                ("startDate", "From", 120),
                ("endDate", "To", 120),
                ("status", "Status", 120),
                ("id", "Period ID", 220),
            ]
        )
        for key in ("startDate", "endDate"):
            self.periods_table.set_formatter(key, lambda value, _row: format_date(value))
        periods_layout.addWidget(self.periods_table, 1)
        period_actions = QHBoxLayout()
        self.lock_button = primary_button("Lock period")
        self.lock_button.clicked.connect(lambda: self.change_period("lock"))
        self.close_button = primary_button("Close period")
        self.close_button.clicked.connect(lambda: self.change_period("close"))
        period_actions.addWidget(self.lock_button)
        period_actions.addWidget(self.close_button)
        period_actions.addStretch(1)
        periods_layout.addLayout(period_actions)
        layout.addWidget(periods_frame, 1)

        bank_frame = QFrame()
        bank_frame.setObjectName("Panel")
        bank_layout = QVBoxLayout(bank_frame)
        bank_layout.setContentsMargins(18, 16, 18, 16)
        bank_layout.setSpacing(8)
        bank_title = QLabel("Bank accounts")
        bank_title.setObjectName("PageTitle")
        bank_title.setStyleSheet("font-size: 12pt;")
        bank_layout.addWidget(bank_title)
        self.bank_table = DataTable(
            [
                ("bankName", "Bank", 200),
                ("accountNumberEnc", "Account number", 220),
                ("ledgerAccountId", "Ledger account", 220),
                ("branch", "Branch", 160),
                ("id", "ID", 200),
            ]
        )
        bank_layout.addWidget(self.bank_table, 1)
        bank_actions = QHBoxLayout()
        self.new_bank_button = primary_button("Add bank account")
        self.new_bank_button.clicked.connect(self.create_bank_account)
        bank_actions.addWidget(self.new_bank_button)
        bank_actions.addStretch(1)
        bank_layout.addLayout(bank_actions)
        layout.addWidget(bank_frame, 1)

        recon_frame = QFrame()
        recon_frame.setObjectName("Panel")
        recon_layout = QVBoxLayout(recon_frame)
        recon_layout.setContentsMargins(18, 16, 18, 16)
        recon_layout.setSpacing(8)
        recon_title = QLabel("Reconciliations")
        recon_title.setObjectName("PageTitle")
        recon_title.setStyleSheet("font-size: 12pt;")
        recon_layout.addWidget(recon_title)
        self.recon_table = DataTable(
            [
                ("bankAccountId", "Bank account", 200),
                ("statementDate", "Statement date", 140),
                ("statementBalance", "Balance", 150),
                ("status", "Status", 120),
                ("id", "Reconciliation ID", 220),
            ]
        )
        self.recon_table.set_formatter(
            "statementDate", lambda value, _row: format_date(value)
        )
        self.recon_table.set_formatter(
            "statementBalance", lambda value, _row: format_money(value)
        )
        recon_layout.addWidget(self.recon_table, 1)
        recon_actions = QHBoxLayout()
        self.new_recon_button = primary_button("New reconciliation")
        self.new_recon_button.clicked.connect(self.create_reconciliation)
        self.add_line_button = primary_button("Add statement line")
        self.add_line_button.clicked.connect(self.add_recon_line)
        self.match_button = primary_button("Match line")
        self.match_button.clicked.connect(self.match_recon_line)
        for button in (self.new_recon_button, self.add_line_button, self.match_button):
            recon_actions.addWidget(button)
        recon_actions.addStretch(1)
        recon_layout.addLayout(recon_actions)
        layout.addWidget(recon_frame, 2)

        self._update_actions()

    def refresh(self) -> None:
        self.banner.clear()
        can_periods = self.session.has_permission("period:lock")
        can_recon = self.session.has_permission("recon:read")
        if not can_periods and not can_recon:
            self.banner.show_error("Your role cannot view periods or reconciliations.")
            return
        run_async(self._load, self._apply, self._on_error)

    def _load(self) -> dict[str, Any]:
        periods: list[dict[str, Any]] = []
        banks: list[dict[str, Any]] = []
        reconciliations: list[dict[str, Any]] = []
        if self.session.has_permission("period:lock"):
            periods = self.session.accounts.list_periods() or []
        if self.session.has_permission("recon:read"):
            banks = self.session.accounts.list_bank_accounts() or []
            reconciliations = self.session.accounts.list_reconciliations() or []
        return {"periods": periods, "banks": banks, "reconciliations": reconciliations}

    def _apply(self, data: dict[str, Any]) -> None:
        self.periods_table.set_rows(rows_of(data.get("periods"), "periods", "data"))
        self.bank_table.set_rows(rows_of(data.get("banks"), "bankAccounts", "data"))
        self.recon_table.set_rows(rows_of(data.get("reconciliations"), "reconciliations", "data"))
        self._update_actions()
        self.banner.show_info(f"{self.recon_table.rowCount()} reconciliation(s).")

    def _update_actions(self) -> None:
        can_period = self.session.has_permission("period:lock")
        can_write = self.session.has_permission("recon:write")
        selected_period = self.periods_table.selected_row() is not None
        selected_recon = self.recon_table.selected_row() is not None
        self.lock_button.setEnabled(can_period and selected_period)
        self.close_button.setEnabled(can_period and selected_period)
        self.new_bank_button.setEnabled(can_write)
        self.new_recon_button.setEnabled(can_write)
        self.add_line_button.setEnabled(can_write and selected_recon)
        self.match_button.setEnabled(can_write and selected_recon)

    def change_period(self, action: str) -> None:
        if not self.session.has_permission("period:lock"):
            self.banner.show_error("Your role cannot change accounting periods.")
            return
        selected = self.periods_table.selected_row()
        if not selected:
            self.banner.show_info("Select a period first.")
            return
        label = "Lock" if action == "lock" else "Close"
        if not confirm(self, f"{label} period", f"{label} the selected accounting period?"):
            return
        period_id = row_id(selected)

        def task() -> dict[str, Any]:
            if action == "lock":
                return self.session.accounts.lock_period(period_id)
            return self.session.accounts.close_period(period_id)

        run_async(
            task,
            lambda _result: self._on_success(f"Period {action}ed."),
            self._on_error,
        )

    def create_bank_account(self) -> None:
        if not self.session.has_permission("recon:write"):
            self.banner.show_error("Your role cannot change bank accounts.")
            return
        dialog = BankAccountDialog(self)
        if not dialog.exec():
            return
        payload = dialog.payload
        run_async(
            lambda: self.session.accounts.create_bank_account(payload),
            lambda _result: self._on_success("Bank account added."),
            self._on_error,
        )

    def create_reconciliation(self) -> None:
        if not self.session.has_permission("recon:write"):
            self.banner.show_error("Your role cannot change reconciliations.")
            return
        dialog = ReconciliationDialog(self)
        if not dialog.exec():
            return
        payload = dialog.payload
        run_async(
            lambda: self.session.accounts.create_reconciliation(payload),
            lambda _result: self._on_success("Reconciliation created."),
            self._on_error,
        )

    def add_recon_line(self) -> None:
        if not self.session.has_permission("recon:write"):
            self.banner.show_error("Your role cannot change reconciliations.")
            return
        selected = self.recon_table.selected_row()
        if not selected:
            self.banner.show_info("Select a reconciliation first.")
            return
        dialog = ReconLineDialog(self)
        if not dialog.exec():
            return
        reconciliation_id = row_id(selected)
        payload = dialog.payload
        run_async(
            lambda: self.session.accounts.add_reconciliation_line(reconciliation_id, payload),
            lambda _result: self._on_success("Statement line added."),
            self._on_error,
        )

    def match_recon_line(self) -> None:
        if not self.session.has_permission("recon:write"):
            self.banner.show_error("Your role cannot change reconciliations.")
            return
        selected = self.recon_table.selected_row()
        if not selected:
            self.banner.show_info("Select a reconciliation first.")
            return
        dialog = MatchDialog(self)
        if not dialog.exec():
            return
        reconciliation_id = row_id(selected)
        line_id = dialog.payload["lineId"]
        journal_line_id = dialog.payload["journalLineId"]
        run_async(
            lambda: self.session.accounts.match_reconciliation(
                reconciliation_id,
                line_id=line_id,
                journal_line_id=journal_line_id,
            ),
            lambda _result: self._on_success("Statement line matched."),
            self._on_error,
        )

    def _on_success(self, message: str) -> None:
        self.banner.show_success(message)
        self.refresh()

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))
