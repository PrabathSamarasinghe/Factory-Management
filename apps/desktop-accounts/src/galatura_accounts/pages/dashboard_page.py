"""Dashboard with trial balance checks and budget overview."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    FormDialog,
    PageHeader,
    StatCard,
    StatusBanner,
    format_bool,
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

from .common import details_of, money_text, required_text, rows_of, today_text


class BudgetDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("New budget", parent)
        self.name_input = QLineEdit()
        self.period_input = QLineEdit()
        self.amount_input = QLineEdit()
        self.amount_input.setPlaceholderText("0.00")
        self.add_row("Name", self.name_input)
        self.add_row("Fiscal period ID", self.period_input)
        self.add_row("Total amount", self.amount_input)

    def validate(self) -> str | None:
        try:
            required_text(self.name_input.text(), "Name")
            required_text(self.period_input.text(), "Fiscal period ID")
            money_text(self.amount_input.text(), "Total amount")
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        return {
            "name": self.name_input.text().strip(),
            "fiscalPeriodId": self.period_input.text().strip(),
            "totalAmount": money_text(self.amount_input.text(), "Total amount"),
        }


class DashboardPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(14)

        header = PageHeader(
            "Dashboard",
            "Trial balance and budget position from the accounts service.",
        )
        self.refresh_button = ghost_button("Refresh")
        self.refresh_button.clicked.connect(self.refresh)
        header.add_action(self.refresh_button)
        layout.addWidget(header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        filters = QHBoxLayout()
        filters.setSpacing(8)
        filters.addWidget(QLabel("As of"))
        self.as_of_input = QLineEdit(today_text())
        self.as_of_input.setMaximumWidth(150)
        self.apply_button = primary_button("Apply")
        self.apply_button.clicked.connect(self.refresh)
        filters.addWidget(self.as_of_input)
        filters.addWidget(self.apply_button)
        filters.addStretch(1)
        layout.addLayout(filters)

        cards = QHBoxLayout()
        cards.setSpacing(12)
        self.debit_card = StatCard("Total debits", "-")
        self.credit_card = StatCard("Total credits", "-")
        self.check_card = StatCard("Trial balance", "-")
        for card in (self.debit_card, self.credit_card, self.check_card):
            cards.addWidget(card)
        layout.addLayout(cards)

        trial_frame = QFrame()
        trial_frame.setObjectName("Panel")
        trial_layout = QVBoxLayout(trial_frame)
        trial_layout.setContentsMargins(18, 16, 18, 16)
        trial_layout.setSpacing(10)
        trial_title = QLabel("Trial balance")
        trial_title.setObjectName("PageTitle")
        trial_title.setStyleSheet("font-size: 12pt;")
        trial_layout.addWidget(trial_title)

        self.trial_table = DataTable(
            [
                ("code", "Code", 110),
                ("name", "Account", 280),
                ("debit", "Debit", 150),
                ("credit", "Credit", 150),
                ("balance", "Balance", 150),
            ]
        )
        for key in ("debit", "credit", "balance"):
            self.trial_table.set_formatter(key, lambda value, _row: format_money(value))
        trial_layout.addWidget(self.trial_table, 1)
        layout.addWidget(trial_frame, 2)

        budget_frame = QFrame()
        budget_frame.setObjectName("Panel")
        budget_layout = QVBoxLayout(budget_frame)
        budget_layout.setContentsMargins(18, 16, 18, 16)
        budget_layout.setSpacing(10)
        budget_title = QLabel("Budgets")
        budget_title.setObjectName("PageTitle")
        budget_title.setStyleSheet("font-size: 12pt;")
        budget_layout.addWidget(budget_title)

        self.budget_table = DataTable(
            [
                ("name", "Name", 260),
                ("fiscalPeriodId", "Period", 200),
                ("totalAmount", "Amount", 150),
                ("status", "Status", 120),
                ("id", "ID", 220),
            ]
        )
        self.budget_table.set_formatter(
            "totalAmount", lambda value, _row: format_money(value)
        )
        budget_layout.addWidget(self.budget_table, 1)

        budget_actions = QHBoxLayout()
        self.new_budget_button = primary_button("New budget")
        self.new_budget_button.clicked.connect(self.create_budget)
        budget_actions.addWidget(self.new_budget_button)
        budget_actions.addStretch(1)
        budget_layout.addLayout(budget_actions)
        layout.addWidget(budget_frame, 1)

        self.apply_button.setEnabled(self.session.has_permission("report:read"))
        self.new_budget_button.setEnabled(self.session.has_permission("budget:write"))

    def refresh(self) -> None:
        self.banner.clear()
        can_view_trial = self.session.has_permission("report:read")
        can_view_budgets = self.session.has_permission("budget:read")
        if not can_view_trial and not can_view_budgets:
            self.banner.show_error("Your role cannot view trial balance or budgets.")
            return
        run_async(self._load, self._apply, self._on_error)

    def _load(self) -> dict[str, Any]:
        trial: Any = {}
        budgets: list[dict[str, Any]] = []
        if self.session.has_permission("report:read"):
            as_of = self.as_of_input.text().strip() or None
            trial = self.session.accounts.trial_balance(as_of=as_of)
        if self.session.has_permission("budget:read"):
            budgets = self.session.accounts.list_budgets() or []
        return {"trial": trial, "budgets": budgets}

    def _apply(self, data: dict[str, Any]) -> None:
        trial = data.get("trial") or {}
        checks = details_of(trial, "checks", "totals")
        totals = details_of(trial.get("totals"), "totals")
        debit_total = checks.get("debit") or checks.get("debits") or totals.get("debit")
        credit_total = checks.get("credit") or checks.get("credits") or totals.get("credit")
        self.debit_card.set_value(format_money(debit_total))
        self.credit_card.set_value(format_money(credit_total))
        balanced = checks.get("balanced")
        if balanced is None:
            balanced = trial.get("balanced")
        self.check_card.set_value(format_bool(balanced) if balanced is not None else "-")

        rows: list[dict[str, Any]] = []
        for row in rows_of(trial, "rows", "accounts", "data"):
            values = row.get("values") if isinstance(row.get("values"), list) else []
            rows.append(
                {
                    "code": row.get("code") or row.get("accountCode") or "-",
                    "name": row.get("name") or row.get("label") or "-",
                    "debit": row.get("debit") or (values[0] if values else None),
                    "credit": row.get("credit") or (values[1] if len(values) > 1 else None),
                    "balance": row.get("balance") or (values[-1] if values else None),
                }
            )
        self.trial_table.set_rows(rows)
        self.budget_table.set_rows(rows_of(data.get("budgets"), "budgets", "data"))
        self.banner.show_info(f"{len(rows)} trial balance row(s).")

    def create_budget(self) -> None:
        if not self.session.has_permission("budget:write"):
            self.banner.show_error("Your role cannot create budgets.")
            return
        dialog = BudgetDialog(self)
        if not dialog.exec():
            return
        payload = dialog.payload
        run_async(
            lambda: self.session.accounts.create_budget(payload),
            lambda _result: self._on_success("Budget created."),
            self._on_error,
        )

    def _on_success(self, message: str) -> None:
        self.banner.show_success(message)
        self.refresh()

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))
