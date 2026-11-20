"""Two-column T-account display for C5."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core.widgets import DataTable, format_date, format_money
from PySide6.QtWidgets import QHBoxLayout, QLabel, QVBoxLayout, QWidget

from ..pages.common import details_of, rows_of


class TAccountWidget(QWidget):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)

        self.account_label = QLabel("Select an account.")
        self.account_label.setObjectName("PageTitle")
        self.balance_label = QLabel("Balance: -")
        self.balance_label.setObjectName("Subtitle")
        layout.addWidget(self.account_label)
        layout.addWidget(self.balance_label)

        sides = QHBoxLayout()
        sides.setSpacing(12)
        self.debit_table = DataTable(
            [("date", "Date", 110), ("description", "Debit", 260), ("amount", "Amount", 120)]
        )
        self.credit_table = DataTable(
            [("date", "Date", 110), ("description", "Credit", 260), ("amount", "Amount", 120)]
        )
        sides.addWidget(self.debit_table, 1)
        sides.addWidget(self.credit_table, 1)
        layout.addLayout(sides, 1)

    def clear(self) -> None:
        self.account_label.setText("Select an account.")
        self.balance_label.setText("Balance: -")
        self.debit_table.clear_rows()
        self.credit_table.clear_rows()

    def set_data(self, data: Any) -> None:
        info = details_of(data, "tAccount", "account", "data")
        account = details_of(info.get("account"), "account")
        if not account and isinstance(data, dict) and data.get("accountId"):
            account = {"id": data.get("accountId")}
        code = account.get("code") or info.get("code") or ""
        name = account.get("name") or info.get("name") or ""
        label = f"{code} {name}".strip() or str(account.get("id") or info.get("accountId") or "-")
        self.account_label.setText(label)

        totals = details_of(info.get("totals"), "totals")
        balance = info.get("closingBalance")
        if balance is None:
            balance = info.get("balance")
        if balance is None:
            balance = totals.get("balance") or totals.get("closingBalance")
        self.balance_label.setText(f"Balance: {format_money(balance)}")

        debit_rows = rows_of(info, "debits", "debitLines", "debitSide")
        credit_rows = rows_of(info, "credits", "creditLines", "creditSide")
        if not debit_rows and not credit_rows:
            debit_rows, credit_rows = self._split_lines(info)

        self.debit_table.set_rows([self._side_row(row, "debit") for row in debit_rows])
        self.credit_table.set_rows([self._side_row(row, "credit") for row in credit_rows])

        debit_total = info.get("debitTotal") or info.get("totalDebit") or totals.get("debit")
        credit_total = info.get("creditTotal") or info.get("totalCredit") or totals.get("credit")
        self.debit_table.setHorizontalHeaderLabels(
            ["Date", f"Debit - {format_money(debit_total)}", "Amount"]
        )
        self.credit_table.setHorizontalHeaderLabels(
            ["Date", f"Credit - {format_money(credit_total)}", "Amount"]
        )

    def _split_lines(
        self,
        info: dict[str, Any],
    ) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
        debit_rows: list[dict[str, Any]] = []
        credit_rows: list[dict[str, Any]] = []
        for line in rows_of(info, "lines", "entries", "rows", "data"):
            if line.get("debit") not in (None, "", 0, "0"):
                debit_rows.append(line)
            elif line.get("credit") not in (None, "", 0, "0"):
                credit_rows.append(line)
        return debit_rows, credit_rows

    @staticmethod
    def _side_row(row: dict[str, Any], side: str) -> dict[str, Any]:
        amount = row.get(side)
        if amount in (None, ""):
            amount = row.get("amount")
        description = (
            row.get("description")
            or row.get("memo")
            or row.get("narrative")
            or row.get("partyName")
            or row.get("accountName")
            or "-"
        )
        return {
            "date": format_date(row.get("date") or row.get("entryDate")),
            "description": str(description),
            "amount": format_money(amount),
        }
