"""Financial statement viewer and export requests."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import SessionManager, human_error
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

from .common import details_of, rows_of, save_export, today_text

_REPORTS = [
    ("Trial balance", "trial-balance"),
    ("Profit and loss", "profit-loss"),
    ("Balance sheet", "balance-sheet"),
    ("Cash flow", "cash-flow"),
    ("Supplier aging", "supplier-aging"),
]


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

        actions = QHBoxLayout()
        self.load_button = primary_button("Load report")
        self.load_button.clicked.connect(self.refresh)
        self.format_combo = QComboBox()
        for file_format in ("csv", "json", "pdf", "xlsx"):
            self.format_combo.addItem(file_format.upper(), file_format)
        self.export_button = primary_button("Export")
        self.export_button.clicked.connect(self.export_report)
        actions.addWidget(self.load_button)
        actions.addWidget(self.format_combo)
        actions.addWidget(self.export_button)
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
        money_words = ("amount", "value", "balance", "debit", "credit", "change")
        if any(word in text for word in money_words):
            return format_money(value)
        return "" if value is None else str(value)

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
