"""Chart of accounts: create, rename, move and deactivate accounts."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    FormDialog,
    PageHeader,
    StatusBanner,
    confirm,
    danger_button,
    format_bool,
    format_money,
    ghost_button,
    primary_button,
    run_async,
)
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QHBoxLayout,
    QLineEdit,
    QVBoxLayout,
    QWidget,
)

from .common import account_label, flatten_accounts, required_text, row_id


def _combo(items: list[tuple[str, str]]) -> QComboBox:
    combo = QComboBox()
    for label, value in items:
        combo.addItem(label, value)
    return combo


class AccountDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("New account", parent)
        self.code_input = QLineEdit()
        self.name_input = QLineEdit()
        self.type_combo = _combo(
            [
                ("Asset", "ASSET"),
                ("Liability", "LIABILITY"),
                ("Equity", "EQUITY"),
                ("Income", "INCOME"),
                ("Expense", "EXPENSE"),
            ]
        )
        self.normal_combo = _combo([("Debit", "DEBIT"), ("Credit", "CREDIT")])
        self.parent_input = QLineEdit()
        self.parent_input.setPlaceholderText("Optional parent account ID")
        self.postable_check = QCheckBox("Postable")
        self.postable_check.setChecked(True)
        self.control_check = QCheckBox("Control account")
        self.party_combo = _combo(
            [
                ("None", None),
                ("Supplier", "SUPPLIER"),
                ("Employee", "EMPLOYEE"),
                ("Other", "OTHER"),
            ]
        )
        self.statement_combo = _combo(
            [
                ("None", None),
                ("Balance sheet", "BALANCE_SHEET"),
                ("Profit and loss", "PROFIT_LOSS"),
            ]
        )
        self.section_input = QLineEdit()
        self.section_input.setPlaceholderText("Optional report section ID")
        self.sort_input = QLineEdit("0")
        self.cash_flow_combo = _combo(
            [
                ("None", None),
                ("Operating", "OPERATING"),
                ("Investing", "INVESTING"),
                ("Financing", "FINANCING"),
                ("Cash", "CASH"),
            ]
        )
        self.cash_check = QCheckBox("Cash account")
        self.manual_check = QCheckBox("Allow manual posting")
        self.manual_check.setChecked(True)

        self.add_row("Code", self.code_input)
        self.add_row("Name", self.name_input)
        self.add_row("Account type", self.type_combo)
        self.add_row("Normal balance", self.normal_combo)
        self.add_row("Parent ID", self.parent_input)
        self.add_row("Statement", self.statement_combo)
        self.add_row("Section ID", self.section_input)
        self.add_row("Sort order", self.sort_input)
        self.add_row("Cash flow category", self.cash_flow_combo)
        self.add_row("Party type", self.party_combo)
        self.add_row("Flags", self.postable_check)
        self.add_row("", self.control_check)
        self.add_row("", self.cash_check)
        self.add_row("", self.manual_check)

    def validate(self) -> str | None:
        try:
            required_text(self.code_input.text(), "Code")
            required_text(self.name_input.text(), "Name")
            sort = required_text(self.sort_input.text(), "Sort order")
            int(sort)
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "code": self.code_input.text().strip(),
            "name": self.name_input.text().strip(),
            "accountType": self.type_combo.currentData(),
            "normalBalance": self.normal_combo.currentData(),
            "sortOrder": int(self.sort_input.text().strip()),
            "isPostable": self.postable_check.isChecked(),
            "isControl": self.control_check.isChecked(),
            "isCashAccount": self.cash_check.isChecked(),
            "allowManualPosting": self.manual_check.isChecked(),
        }
        optional = {
            "parentId": self.parent_input.text().strip() or None,
            "partyType": self.party_combo.currentData(),
            "statement": self.statement_combo.currentData(),
            "sectionId": self.section_input.text().strip() or None,
            "cashFlowCategory": self.cash_flow_combo.currentData(),
        }
        for key, value in optional.items():
            if value is not None:
                payload[key] = value
        return payload


class UpdateAccountDialog(FormDialog):
    def __init__(self, account: dict[str, Any], parent: QWidget | None = None) -> None:
        super().__init__("Edit account", parent)
        self.name_input = QLineEdit(str(account.get("name") or ""))
        self.parent_input = QLineEdit(str(account.get("parentId") or ""))
        self.deactivated_check = QCheckBox("Deactivated")
        self.deactivated_check.setChecked(bool(account.get("deactivated")))
        self.add_row("Name", self.name_input)
        self.add_row("Parent ID", self.parent_input)
        self.add_row("Status", self.deactivated_check)

    def validate(self) -> str | None:
        try:
            required_text(self.name_input.text(), "Name")
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        return {
            "name": self.name_input.text().strip(),
            "parentId": self.parent_input.text().strip() or None,
            "deactivated": self.deactivated_check.isChecked(),
        }


class ChartOfAccountsPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session
        self.accounts: list[dict[str, Any]] = []

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(14)

        header = PageHeader(
            "Chart of Accounts",
            "Open postable T-accounts, arrange report sections and deactivate old accounts.",
        )
        self.refresh_button = ghost_button("Refresh")
        self.refresh_button.clicked.connect(self.refresh)
        header.add_action(self.refresh_button)
        layout.addWidget(header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        self.table = DataTable(
            [
                ("code", "Code", 100),
                ("name", "Name", 260),
                ("accountType", "Type", 110),
                ("normalBalance", "Normal", 100),
                ("parentLabel", "Parent", 220),
                ("statement", "Statement", 140),
                ("balance", "Balance", 140),
                ("isPostable", "Postable", 90),
                ("deactivated", "Active", 80),
            ]
        )
        self.table.set_formatter("balance", lambda value, _row: format_money(value))
        self.table.set_formatter("isPostable", lambda value, _row: format_bool(value))
        self.table.set_formatter(
            "deactivated",
            lambda value, _row: format_bool(not value, yes="Yes", no="No"),
        )
        layout.addWidget(self.table, 1)

        actions = QHBoxLayout()
        self.new_button = primary_button("New account")
        self.new_button.clicked.connect(self.create_account)
        self.edit_button = primary_button("Edit selected")
        self.edit_button.clicked.connect(self.edit_account)
        self.deactivate_button = danger_button("Deactivate selected")
        self.deactivate_button.clicked.connect(self.deactivate_account)
        for button in (self.new_button, self.edit_button, self.deactivate_button):
            actions.addWidget(button)
        actions.addStretch(1)
        layout.addLayout(actions)

        self._update_actions()

    def refresh(self) -> None:
        self.banner.clear()
        if not self.session.has_permission("coa:read"):
            self.banner.show_error("Your role does not include coa:read.")
            return
        run_async(lambda: self.session.accounts.accounts_tree() or [], self._apply, self._on_error)

    def _apply(self, data: Any) -> None:
        self.accounts = flatten_accounts(data)
        names = {
            row_id(account): account_label(account)
            for account in self.accounts
            if row_id(account)
        }
        rows: list[dict[str, Any]] = []
        for account in self.accounts:
            parent_id = str(account.get("parentId") or "")
            rows.append(
                {
                    **account,
                    "parentLabel": names.get(parent_id, parent_id or "-"),
                    "balance": account.get("balance")
                    or account.get("closingBalance")
                    or account.get("currentBalance"),
                }
            )
        self.table.set_rows(rows)
        self._update_actions()
        self.banner.show_info(f"{len(rows)} account(s).")

    def _update_actions(self) -> None:
        selected = self.table.selected_row() is not None
        self.new_button.setEnabled(self.session.has_permission("coa:create"))
        self.edit_button.setEnabled(self.session.has_permission("coa:update") and selected)
        self.deactivate_button.setEnabled(
            self.session.has_permission("coa:deactivate") and selected
        )

    def create_account(self) -> None:
        if not self.session.has_permission("coa:create"):
            self.banner.show_error("Your role cannot create accounts.")
            return
        dialog = AccountDialog(self)
        if not dialog.exec():
            return
        payload = dialog.payload
        run_async(
            lambda: self.session.accounts.create_account(payload),
            lambda _result: self._on_success("Account created."),
            self._on_error,
        )

    def edit_account(self) -> None:
        if not self.session.has_permission("coa:update"):
            self.banner.show_error("Your role cannot update accounts.")
            return
        selected = self.table.selected_row()
        if not selected:
            self.banner.show_info("Select an account first.")
            return
        dialog = UpdateAccountDialog(selected, self)
        if not dialog.exec():
            return
        account_id = row_id(selected)
        payload = dialog.payload
        run_async(
            lambda: self.session.accounts.update_account(account_id, payload),
            lambda _result: self._on_success("Account updated."),
            self._on_error,
        )

    def deactivate_account(self) -> None:
        if not self.session.has_permission("coa:deactivate"):
            self.banner.show_error("Your role cannot deactivate accounts.")
            return
        selected = self.table.selected_row()
        if not selected:
            self.banner.show_info("Select an account first.")
            return
        if not confirm(
            self,
            "Deactivate account",
            f"Stop new postings to {account_label(selected)}? History is kept.",
        ):
            return
        account_id = row_id(selected)
        run_async(
            lambda: self.session.accounts.deactivate_account(account_id),
            lambda _result: self._on_success("Account deactivated."),
            self._on_error,
        )

    def _on_success(self, message: str) -> None:
        self.banner.show_success(message)
        self.refresh()

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))
