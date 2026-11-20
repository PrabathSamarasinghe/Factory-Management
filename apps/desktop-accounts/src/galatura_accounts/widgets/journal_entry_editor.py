"""Journal entry editor with debit/credit balance validation."""

from __future__ import annotations

from decimal import Decimal
from typing import Any
from uuid import uuid4

from galatura_desktop_core.widgets import (
    FormDialog,
    StatusBanner,
    danger_button,
    ghost_button,
)
from PySide6.QtCore import Signal
from PySide6.QtWidgets import (
    QComboBox,
    QFormLayout,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QLineEdit,
    QTableWidget,
    QVBoxLayout,
    QWidget,
)

from ..pages.common import account_label, flatten_accounts, money_text, row_id, rows_of, today_text


def _line_total(lines: list[dict[str, Any]], key: str) -> Decimal:
    return sum((Decimal(str(line[key])) for line in lines if key in line), Decimal("0"))


class OpeningEntryDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("Opening balance entry", parent)
        self.date_input = QLineEdit(today_text())
        self.description_input = QLineEdit("Opening balances")
        self.add_row("Entry date", self.date_input)
        self.add_row("Description", self.description_input)

    def validate(self) -> str | None:
        if not self.date_input.text().strip():
            return "Entry date is required."
        return None

    def collect(self) -> dict[str, Any]:
        return {
            "entryDate": self.date_input.text().strip(),
            "description": self.description_input.text().strip(),
        }


class JournalEntryEditor(QWidget):
    changed = Signal()

    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.accounts: list[dict[str, Any]] = []
        self.entry_id: str | None = None

        layout = QVBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(8)

        form = QFormLayout()
        self.date_input = QLineEdit(today_text())
        self.description_input = QLineEdit()
        self.description_input.setPlaceholderText("Optional journal description")
        form.addRow("Entry date", self.date_input)
        form.addRow("Description", self.description_input)
        layout.addLayout(form)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        self.table = QTableWidget(0, 7)
        self.table.setHorizontalHeaderLabels(
            ["Account", "Debit", "Credit", "Party type", "Party ID", "Memo", "Cost centre"]
        )
        self.table.horizontalHeader().setSectionResizeMode(
            self.table.columnCount() - 1, QHeaderView.ResizeMode.Stretch
        )
        for index, width in enumerate((260, 120, 120, 120, 150, 200, 150)):
            self.table.setColumnWidth(index, width)
        self.table.verticalHeader().setVisible(False)
        layout.addWidget(self.table, 1)

        buttons = QHBoxLayout()
        self.add_button = ghost_button("Add line")
        self.add_button.clicked.connect(lambda: self._add_line())
        self.remove_button = danger_button("Remove line")
        self.remove_button.clicked.connect(self._remove_line)
        buttons.addWidget(self.add_button)
        buttons.addWidget(self.remove_button)
        buttons.addStretch(1)
        layout.addLayout(buttons)

        self.totals_label = QLabel("Debits 0.00 | Credits 0.00 | Not balanced")
        self.totals_label.setObjectName("Subtitle")
        layout.addWidget(self.totals_label)

        self.table.itemChanged.connect(self.update_totals)
        self._add_line()
        self._add_line()
        self.update_totals()

    def set_accounts(self, data: Any) -> None:
        self.accounts = flatten_accounts(data)
        selected = [
            self._combo(row).currentData() if self._combo(row) else None
            for row in range(self.table.rowCount())
        ]
        for row in range(self.table.rowCount()):
            combo = self._combo(row)
            if combo is None:
                continue
            combo.blockSignals(True)
            combo.clear()
            combo.addItem("Select account", None)
            for account in self.accounts:
                combo.addItem(account_label(account), account.get("id"))
            index = combo.findData(selected[row]) if row < len(selected) else -1
            combo.setCurrentIndex(index if index >= 0 else 0)
            combo.blockSignals(False)

    def clear(self, *, keep_date: bool = False) -> None:
        self.entry_id = None
        current_date = self.date_input.text().strip() or today_text()
        self.description_input.clear()
        self.table.setRowCount(0)
        self._add_line()
        self._add_line()
        self.date_input.setText(current_date if keep_date else today_text())
        self.update_totals()

    def load_entry(self, entry: dict[str, Any]) -> None:
        self.entry_id = row_id(entry)
        self.date_input.setText(str(entry.get("entryDate") or "")[:10])
        self.description_input.setText(str(entry.get("description") or ""))
        self.table.setRowCount(0)
        lines = rows_of(entry, "lines", "journalLines", "entries")
        if not lines:
            self._add_line()
            self._add_line()
        for line in lines:
            account = line.get("account")
            if not isinstance(account, dict):
                account = {}
            account_id = line.get("accountId") or account.get("id")
            self._add_line(
                account_id=account_id,
                debit=line.get("debit") or line.get("debitAmount"),
                credit=line.get("credit") or line.get("creditAmount"),
                party_type=line.get("partyType"),
                party_id=line.get("partyId"),
                memo=line.get("memo"),
                cost_centre_id=line.get("costCentreId"),
            )
        self.update_totals()

    def payload(self, idempotency_key: str | None = None) -> dict[str, Any]:
        lines = self._collect_lines()
        payload: dict[str, Any] = {
            "entryDate": self.date_input.text().strip(),
            "lines": lines,
        }
        description = self.description_input.text().strip()
        if description:
            payload["description"] = description
        if idempotency_key:
            payload["idempotencyKey"] = idempotency_key
        return payload

    def totals(self) -> tuple[Decimal, Decimal]:
        try:
            lines = self._collect_lines()
        except ValueError:
            return Decimal("0"), Decimal("0")
        debit = _line_total(lines, "debit")
        credit = _line_total(lines, "credit")
        return debit, credit

    def is_balanced(self) -> bool:
        try:
            lines = self._collect_lines()
        except ValueError:
            return False
        if not lines:
            return False
        debit = _line_total(lines, "debit")
        credit = _line_total(lines, "credit")
        return debit > 0 and debit == credit

    def update_totals(self, *_args: Any) -> None:
        try:
            lines = self._collect_lines()
            debit = sum(
                (Decimal(str(line["debit"])) for line in lines if "debit" in line),
                Decimal("0"),
            )
            credit = sum(
                (Decimal(str(line["credit"])) for line in lines if "credit" in line),
                Decimal("0"),
            )
        except ValueError as exc:
            self.totals_label.setText("Debits - | Credits - | Invalid amount")
            self.banner.show_error(str(exc))
            self.changed.emit()
            return
        self.banner.clear()
        state = "Balanced" if lines and debit == credit else "Not balanced"
        self.totals_label.setText(
            f"Debits {format(debit, '.2f')} | Credits {format(credit, '.2f')} | {state}"
        )
        self.changed.emit()

    def save_draft(self, idempotency_key: str | None = None) -> dict[str, Any]:
        return self.payload(idempotency_key or str(uuid4()))

    def _combo(self, row: int) -> QComboBox | None:
        widget = self.table.cellWidget(row, 0)
        return widget if isinstance(widget, QComboBox) else None

    def _text(self, row: int, column: int) -> str:
        widget = self.table.cellWidget(row, column)
        return widget.text().strip() if isinstance(widget, QLineEdit) else ""

    def _add_line(
        self,
        *,
        account_id: Any = None,
        debit: Any = None,
        credit: Any = None,
        party_type: Any = None,
        party_id: Any = None,
        memo: Any = None,
        cost_centre_id: Any = None,
    ) -> None:
        row = self.table.rowCount()
        self.table.insertRow(row)

        combo = QComboBox()
        combo.addItem("Select account", None)
        for account in self.accounts:
            combo.addItem(account_label(account), account.get("id"))
        if account_id:
            index = combo.findData(account_id)
            if index >= 0:
                combo.setCurrentIndex(index)
        combo.currentIndexChanged.connect(self.update_totals)
        self.table.setCellWidget(row, 0, combo)

        values = (debit, credit, party_type, party_id, memo, cost_centre_id)
        for column, value in enumerate(values, start=1):
            editor = QLineEdit("" if value is None else str(value))
            editor.textChanged.connect(self.update_totals)
            if column in (1, 2):
                editor.setPlaceholderText("0.00")
            self.table.setCellWidget(row, column, editor)

    def _remove_line(self) -> None:
        row = self.table.currentRow()
        if row < 0 and self.table.rowCount():
            row = self.table.rowCount() - 1
        if row >= 0:
            self.table.removeRow(row)
        self.update_totals()

    def _collect_lines(self) -> list[dict[str, Any]]:
        lines: list[dict[str, Any]] = []
        for row in range(self.table.rowCount()):
            combo = self._combo(row)
            account_id = str(combo.currentData() or "") if combo else ""
            if not account_id:
                if any(self._text(row, column) for column in range(1, 7)):
                    raise ValueError(f"Select an account for line {row + 1}.")
                continue
            debit_text = self._text(row, 1)
            credit_text = self._text(row, 2)
            if debit_text and credit_text:
                raise ValueError(f"Line {row + 1} cannot have both a debit and a credit.")
            line: dict[str, Any] = {"accountId": account_id}
            if debit_text:
                amount = money_text(debit_text, f"Debit on line {row + 1}")
                if Decimal(amount) < 0:
                    raise ValueError(f"Debit on line {row + 1} cannot be negative.")
                line["debit"] = amount
            if credit_text:
                amount = money_text(credit_text, f"Credit on line {row + 1}")
                if Decimal(amount) < 0:
                    raise ValueError(f"Credit on line {row + 1} cannot be negative.")
                line["credit"] = amount
            if "debit" not in line and "credit" not in line:
                raise ValueError(f"Enter a debit or credit for line {row + 1}.")
            for key, column in (
                ("partyType", 3),
                ("partyId", 4),
                ("memo", 5),
                ("costCentreId", 6),
            ):
                value = self._text(row, column)
                if value:
                    line[key] = value
            lines.append(line)
        return lines
