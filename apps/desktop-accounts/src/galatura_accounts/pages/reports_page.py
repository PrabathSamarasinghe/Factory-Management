"""Financial statement viewer and export requests."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import ApiError, SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    PageHeader,
    StatusBanner,
    format_bool,
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

from ..widgets.drilldown import DrilldownDialog
from .common import account_id_of, details_of, entry_id_of, row_id, rows_of, save_export, today_text

_REPORTS = [
    ("Trial balance", "trial-balance"),
    ("Profit and loss", "profit-loss"),
    ("Balance sheet", "balance-sheet"),
    ("Cash flow", "cash-flow"),
    ("Statement of changes in equity", "equity-changes"),
    ("Budget vs actual", "budget-vs-actual"),
    ("Supplier aging", "supplier-aging"),
]

_REPORT_NOTES = {
    "trial-balance": "Debits and credits as at a date; the balance check must be Yes.",
    "profit-loss": "Income and expense sections for the selected period.",
    "balance-sheet": "Assets, liabilities and equity as at the selected date.",
    "cash-flow": "Indirect cash flow for the selected period.",
    "equity-changes": "Opening equity, profit, capital movements and closing equity.",
    "budget-vs-actual": "Budget, actual and variance per account; select a budget below.",
    "supplier-aging": "Outstanding supplier payables by aging bucket.",
}


class ReportsPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session
        self.report: Any = {}

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(14)

        header = PageHeader(
            "Reports",
            "View ready-to-draw statements and request CSV, JSON, PDF or XLSX exports.",
        )
        self.refresh_button = ghost_button("Refresh")
        self.refresh_button.clicked.connect(self.refresh)
        header.add_action(self.refresh_button)
        layout.addWidget(header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        filters = QHBoxLayout()
        filters.setSpacing(8)
        filters.addWidget(QLabel("Report"))
        self.report_combo = QComboBox()
        for label, value in _REPORTS:
            self.report_combo.addItem(label, value)
        filters.addWidget(self.report_combo)
        filters.addWidget(QLabel("From"))
        self.from_input = QLineEdit()
        self.from_input.setPlaceholderText("YYYY-MM-DD")
        self.from_input.setMaximumWidth(140)
        filters.addWidget(self.from_input)
        filters.addWidget(QLabel("To"))
        self.to_input = QLineEdit()
        self.to_input.setPlaceholderText("YYYY-MM-DD")
        self.to_input.setMaximumWidth(140)
        filters.addWidget(self.to_input)
        filters.addWidget(QLabel("As of"))
        self.as_of_input = QLineEdit(today_text())
        self.as_of_input.setMaximumWidth(140)
        filters.addWidget(self.as_of_input)
        layout.addLayout(filters)

        budget_filters = QHBoxLayout()
        budget_filters.setSpacing(8)
        budget_filters.addWidget(QLabel("Budget"))
        self.budget_combo = QComboBox()
        self.budget_combo.setMinimumWidth(260)
        budget_filters.addWidget(self.budget_combo, 1)
        self.view_note = QLabel("")
        self.view_note.setObjectName("Subtitle")
        budget_filters.addWidget(self.view_note, 2)
        layout.addLayout(budget_filters)

        actions = QHBoxLayout()
        self.load_button = primary_button("Load report")
        self.load_button.clicked.connect(self.refresh)
        self.format_combo = QComboBox()
        for file_format in ("csv", "json", "pdf", "xlsx"):
            self.format_combo.addItem(file_format.upper(), file_format)
        self.export_button = primary_button("Export")
        self.export_button.clicked.connect(self.export_report)
        self.drilldown_button = ghost_button("Drill down")
        self.drilldown_button.clicked.connect(self.drilldown)
        self.report_combo.currentIndexChanged.connect(
            lambda _index: self._on_report_changed()
        )
        actions.addWidget(self.load_button)
        actions.addWidget(self.format_combo)
        actions.addWidget(self.export_button)
        actions.addWidget(self.drilldown_button)
        actions.addStretch(1)
        layout.addLayout(actions)

        viewer_frame = QFrame()
        viewer_frame.setObjectName("Panel")
        viewer_layout = QVBoxLayout(viewer_frame)
        viewer_layout.setContentsMargins(18, 16, 18, 16)
        viewer_layout.setSpacing(8)
        viewer_title = QLabel("Statement viewer")
        viewer_title.setObjectName("PageTitle")
        viewer_title.setStyleSheet("font-size: 12pt;")
        viewer_layout.addWidget(viewer_title)
        self.check_label = QLabel("Check: -")
        self.check_label.setObjectName("Subtitle")
        viewer_layout.addWidget(self.check_label)

        self.table = DataTable()
        viewer_layout.addWidget(self.table, 1)
        layout.addWidget(viewer_frame, 1)

        self.load_button.setEnabled(self.session.has_permission("report:read"))
        self.export_button.setEnabled(self.session.has_permission("report:export"))
        self.drilldown_button.setEnabled(
            self.session.has_permission("report:read")
            and self.session.has_permission("ledger:read")
        )
        self._on_report_changed()
        if self.session.has_permission("budget:read"):
            run_async(self._load_budgets, self._apply_budgets, self._on_error)

    def _load_budgets(self) -> list[dict[str, Any]]:
        try:
            return self.session.accounts.list_budgets() or []
        except ApiError:
            return []

    def _apply_budgets(self, budgets: list[dict[str, Any]]) -> None:
        selected = self.budget_combo.currentData()
        self.budget_combo.blockSignals(True)
        self.budget_combo.clear()
        self.budget_combo.addItem("Select budget", None)
        for budget in budgets:
            self.budget_combo.addItem(
                str(budget.get("name") or budget.get("code") or budget.get("id") or "-"),
                budget.get("id"),
            )
        index = self.budget_combo.findData(selected) if selected else -1
        self.budget_combo.setCurrentIndex(index if index >= 0 else 0)
        self.budget_combo.blockSignals(False)

    def _on_report_changed(self) -> None:
        report_type = str(self.report_combo.currentData() or "")
        self.budget_combo.setEnabled(report_type == "budget-vs-actual")
        self.view_note.setText(_REPORT_NOTES.get(report_type, ""))

    def refresh(self) -> None:
        self.banner.clear()
        if not self.session.has_permission("report:read"):
            self.banner.show_error("Your role does not include report:read.")
            return
        run_async(self._load_report, self._apply_report, self._on_error)

    def _load_report(self) -> Any:
        report_type = str(self.report_combo.currentData() or "")
        from_date = self.from_input.text().strip() or None
        to_date = self.to_input.text().strip() or None
        as_of = self.as_of_input.text().strip() or None
        if report_type == "trial-balance":
            return self.session.accounts.trial_balance(as_of=as_of)
        if report_type == "profit-loss":
            return self.session.accounts.profit_loss(from_date=from_date, to_date=to_date)
        if report_type == "balance-sheet":
            return self.session.accounts.balance_sheet(as_of=as_of)
        if report_type == "cash-flow":
            return self.session.accounts.cash_flow(from_date=from_date, to_date=to_date)
        if report_type == "equity-changes":
            return self.session.accounts.equity_changes(from_date=from_date, to_date=to_date)
        if report_type == "budget-vs-actual":
            return self.session.accounts.budget_vs_actual(
                budget_id=str(self.budget_combo.currentData() or "") or None,
                from_date=from_date,
                to_date=to_date,
            )
        return self.session.accounts.supplier_aging(as_of=as_of)

    def _apply_report(self, data: Any) -> None:
        self.report = data
        info = details_of(data, "report", "data")
        columns = info.get("columns")
        if not isinstance(columns, list) or not columns:
            columns = ["Value"]
        table_columns: list[tuple[str, str, int]] = [("label", "Label", 340)]
        for index, column in enumerate(columns):
            table_columns.append((f"value{index}", str(column), 170))
        table_columns.extend([("level", "Level", 70), ("style", "Style", 110)])
        self.table.set_columns(table_columns)
        for index, column in enumerate(columns):
            self.table.set_formatter(
                f"value{index}",
                lambda value, _row, label=str(column): self._format_value(label, value),
            )

        rows: list[dict[str, Any]] = []
        for row in rows_of(data, "rows", "data"):
            values = row.get("values") if isinstance(row.get("values"), list) else []
            item: dict[str, Any] = {
                "label": row.get("label") or row.get("name") or row.get("code") or "-",
                "level": row.get("level", ""),
                "style": row.get("style", ""),
                "_source": row,
            }
            for index, _column in enumerate(columns):
                item[f"value{index}"] = values[index] if index < len(values) else None
            rows.append(item)
        self.table.set_rows(rows)

        checks = details_of(info.get("checks"), "checks")
        balanced = checks.get("balanced", info.get("balanced"))
        self.check_label.setText(f"Check: {format_bool(balanced) if balanced is not None else '-'}")
        self.banner.show_info(f"Loaded {len(rows)} report row(s).")

    @staticmethod
    def _format_value(label: str, value: Any) -> str:
        text = str(label).lower()
        if "%" in text:
            return "" if value is None else f"{value}%"
        money_words = (
            "amount",
            "value",
            "balance",
            "debit",
            "credit",
            "change",
            "budget",
            "actual",
            "variance",
            "opening",
            "closing",
            "equity",
            "profit",
        )
        if any(word in text for word in money_words):
            return format_money(value)
        return "" if value is None else str(value)

    def drilldown(self) -> None:
        if not self.session.has_permission("ledger:read"):
            self.banner.show_error("Your role does not include ledger:read.")
            return
        selected = self.table.selected_row()
        if not selected:
            self.banner.show_info("Select a report row first.")
            return
        source = selected.get("_source") if isinstance(selected.get("_source"), dict) else {}
        account_id = account_id_of(source) or account_id_of(selected)
        entry_id = entry_id_of(source) or entry_id_of(selected)
        dialog = DrilldownDialog(self.session, self)
        self._drilldown_dialog = dialog
        if account_id:
            dialog.show()
            dialog.show_ledger(
                account_id,
                from_date=self.from_input.text().strip() or None,
                to_date=self.to_input.text().strip() or None,
                as_of=self.as_of_input.text().strip() or None,
            )
            return
        if entry_id:
            dialog.show()
            dialog.show_journal_entry(entry_id)
            return
        row_key = row_id(source) or str(selected.get("label") or "").strip()
        if not row_key:
            self.banner.show_error("The selected row has no drill-down identifier.")
            return
        report_type = str(self.report_combo.currentData() or "")
        self.banner.clear()
        run_async(
            lambda: self.session.accounts.report_drilldown(
                report_type,
                row_key,
                as_of=self.as_of_input.text().strip() or None,
                from_date=self.from_input.text().strip() or None,
                to_date=self.to_input.text().strip() or None,
            ),
            lambda target: self._apply_drilldown(dialog, target),
            self._on_drilldown_error,
        )

    def _apply_drilldown(self, dialog: DrilldownDialog, target: Any) -> None:
        if not dialog.open_target(target):
            self.banner.show_error("No ledger or journal entry was linked to that report row.")
            return
        dialog.show()

    def _on_drilldown_error(self, error: BaseException) -> None:
        if isinstance(error, ApiError) and error.status == 404:
            self.banner.show_info("No drill-down is linked to that report row.")
            return
        self._on_error(error)

    def export_report(self) -> None:
        if not self.session.has_permission("report:export"):
            self.banner.show_error("Your role cannot export reports.")
            return
        report_type = str(self.report_combo.currentData() or "")
        file_format = str(self.format_combo.currentData() or "csv")
        run_async(
            lambda: self.session.accounts.export_report(
                report_type,
                file_format=file_format,
                as_of=self.as_of_input.text().strip() or None,
                from_date=self.from_input.text().strip() or None,
                to_date=self.to_input.text().strip() or None,
                budget_id=str(self.budget_combo.currentData() or "") or None,
            ),
            lambda result: self._on_export(result, report_type, file_format),
            self._on_error,
        )

    def _on_export(self, result: Any, report_type: str, file_format: str) -> None:
        name = f"{report_type}-export.{file_format}"
        if save_export(self, name, result, file_format):
            self.banner.show_success("Report export saved.")

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))
