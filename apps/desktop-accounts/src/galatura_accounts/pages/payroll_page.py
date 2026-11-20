"""Payroll calculation, approval, wages due and wage components."""

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
    QCheckBox,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QVBoxLayout,
    QWidget,
)

from .common import details_of, required_text, rows_of, today_text


class CalculatePayrollDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("Calculate payroll", parent)
        self.from_input = QLineEdit(today_text())
        self.to_input = QLineEdit(today_text())
        self.run_input = QLineEdit()
        self.run_input.setPlaceholderText("Optional run type")
        self.add_row("From date", self.from_input)
        self.add_row("To date", self.to_input)
        self.add_row("Run type", self.run_input)

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
        run_type = self.run_input.text().strip()
        if run_type:
            payload["runType"] = run_type
        return payload


class WageComponentDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("New wage component", parent)
        self.code_input = QLineEdit()
        self.name_input = QLineEdit()
        self.type_input = QLineEdit()
        self.taxable_check = QCheckBox("Taxable")
        self.formula_input = QLineEdit()
        self.add_row("Code", self.code_input)
        self.add_row("Name", self.name_input)
        self.add_row("Component type", self.type_input)
        self.add_row("Taxable", self.taxable_check)
        self.add_row("Formula", self.formula_input)

    def validate(self) -> str | None:
        try:
            required_text(self.code_input.text(), "Code")
            required_text(self.name_input.text(), "Name")
            required_text(self.type_input.text(), "Component type")
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "code": self.code_input.text().strip(),
            "name": self.name_input.text().strip(),
            "componentType": self.type_input.text().strip(),
            "taxable": self.taxable_check.isChecked(),
        }
        formula = self.formula_input.text().strip()
        if formula:
            payload["formula"] = formula
        return payload


class PayrollPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(12)

        header = PageHeader(
            "Payroll",
            "Calculate and approve payroll runs, then check employee wages due.",
        )
        self.refresh_button = ghost_button("Refresh")
        self.refresh_button.clicked.connect(self.refresh)
        header.add_action(self.refresh_button)
        layout.addWidget(header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        runs_frame = QFrame()
        runs_frame.setObjectName("Panel")
        runs_layout = QVBoxLayout(runs_frame)
        runs_layout.setContentsMargins(18, 16, 18, 16)
        runs_layout.setSpacing(8)
        runs_title = QLabel("Payroll runs")
        runs_title.setObjectName("PageTitle")
        runs_title.setStyleSheet("font-size: 12pt;")
        runs_layout.addWidget(runs_title)

        self.runs_table = DataTable(
            [
                ("runType", "Run type", 140),
                ("fromDate", "From", 110),
                ("toDate", "To", 110),
                ("totalAmount", "Amount", 140),
                ("status", "Status", 120),
                ("id", "Run ID", 220),
            ]
        )
        for key in ("fromDate", "toDate"):
            self.runs_table.set_formatter(key, lambda value, _row: format_date(value))
        self.runs_table.set_formatter("totalAmount", lambda value, _row: format_money(value))
        runs_layout.addWidget(self.runs_table, 1)
        runs_actions = QHBoxLayout()
        self.calculate_button = primary_button("Calculate run")
        self.calculate_button.clicked.connect(self.calculate)
        self.approve_button = primary_button("Approve selected")
        self.approve_button.clicked.connect(self.approve)
        runs_actions.addWidget(self.calculate_button)
        runs_actions.addWidget(self.approve_button)
        runs_actions.addStretch(1)
        runs_layout.addLayout(runs_actions)
        layout.addWidget(runs_frame, 2)

        wages_frame = QFrame()
        wages_frame.setObjectName("Panel")
        wages_layout = QVBoxLayout(wages_frame)
        wages_layout.setContentsMargins(18, 16, 18, 16)
        wages_layout.setSpacing(8)
        wages_title = QLabel("Wages due")
        wages_title.setObjectName("PageTitle")
        wages_title.setStyleSheet("font-size: 12pt;")
        wages_layout.addWidget(wages_title)
        wages_filters = QHBoxLayout()
        wages_filters.addWidget(QLabel("Employee ID"))
        self.employee_input = QLineEdit()
        self.employee_input.setMaximumWidth(240)
        wages_filters.addWidget(self.employee_input)
        wages_filters.addWidget(QLabel("As of"))
        self.as_of_input = QLineEdit(today_text())
        self.as_of_input.setMaximumWidth(140)
        wages_filters.addWidget(self.as_of_input)
        self.wages_button = primary_button("Load wages due")
        self.wages_button.clicked.connect(self.load_wages_due)
        wages_filters.addWidget(self.wages_button)
        wages_filters.addStretch(1)
        wages_layout.addLayout(wages_filters)
        self.wages_label = QLabel("Wages due: -")
        self.wages_label.setObjectName("Subtitle")
        wages_layout.addWidget(self.wages_label)
        layout.addWidget(wages_frame, 1)

        components_frame = QFrame()
        components_frame.setObjectName("Panel")
        components_layout = QVBoxLayout(components_frame)
        components_layout.setContentsMargins(18, 16, 18, 16)
        components_layout.setSpacing(8)
        components_title = QLabel("Wage components")
        components_title.setObjectName("PageTitle")
        components_title.setStyleSheet("font-size: 12pt;")
        components_layout.addWidget(components_title)
        self.components_table = DataTable(
            [
                ("code", "Code", 110),
                ("name", "Name", 220),
                ("componentType", "Type", 150),
                ("taxable", "Taxable", 90),
                ("formula", "Formula", 240),
                ("id", "ID", 200),
            ]
        )
        components_layout.addWidget(self.components_table, 1)
        component_actions = QHBoxLayout()
        self.new_component_button = primary_button("New component")
        self.new_component_button.clicked.connect(self.create_component)
        component_actions.addWidget(self.new_component_button)
        component_actions.addStretch(1)
        components_layout.addLayout(component_actions)
        layout.addWidget(components_frame, 2)

        self._update_actions()

    def refresh(self) -> None:
        self.banner.clear()
        if not self.session.has_permission("payroll:run"):
            self.banner.show_error("Your role does not include payroll:run.")
            return
        run_async(self._load, self._apply, self._on_error)

    def _load(self) -> dict[str, Any]:
        runs = self.session.accounts.list_payroll_runs() or []
        components = self.session.accounts.list_wage_components() or []
        return {"runs": runs, "components": components}

    def _apply(self, data: dict[str, Any]) -> None:
        self.runs_table.set_rows(rows_of(data.get("runs"), "runs", "data"))
        self.components_table.set_rows(rows_of(data.get("components"), "components", "data"))
        self._update_actions()
        self.banner.show_info(f"{self.runs_table.rowCount()} payroll run(s).")

    def _update_actions(self) -> None:
        self.calculate_button.setEnabled(self.session.has_permission("payroll:run"))
        self.approve_button.setEnabled(
            self.session.has_permission("payroll:approve")
            and self.runs_table.selected_row() is not None
        )
        self.wages_button.setEnabled(self.session.has_permission("wages:read"))
        self.new_component_button.setEnabled(self.session.has_permission("payroll:run"))

    def calculate(self) -> None:
        if not self.session.has_permission("payroll:run"):
            self.banner.show_error("Your role cannot calculate payroll.")
            return
        dialog = CalculatePayrollDialog(self)
        if not dialog.exec():
            return
        payload = dialog.payload
        key = str(uuid4())
        run_async(
            lambda: self.session.accounts.calculate_payroll(payload, key),
            lambda _result: self._on_success("Payroll calculated."),
            self._on_error,
        )

    def approve(self) -> None:
        if not self.session.has_permission("payroll:approve"):
            self.banner.show_error("Your role cannot approve payroll runs.")
            return
        selected = self.runs_table.selected_row()
        if not selected:
            self.banner.show_info("Select a payroll run first.")
            return
        if not confirm(self, "Approve payroll", "Approve and post this payroll run?"):
            return
        run_id = str(selected.get("id") or "")
        key = str(uuid4())
        run_async(
            lambda: self.session.accounts.approve_payroll_run(run_id, key),
            lambda _result: self._on_success("Payroll run approved."),
            self._on_error,
        )

    def load_wages_due(self) -> None:
        if not self.session.has_permission("wages:read"):
            self.banner.show_error("Your role cannot read wages due.")
            return
        employee_id = self.employee_input.text().strip()
        if not employee_id:
            self.banner.show_info("Enter an employee ID first.")
            return
        run_async(
            lambda: self.session.accounts.employee_wages_due(
                employee_id,
                as_of=self.as_of_input.text().strip() or None,
            ),
            self._apply_wages_due,
            self._on_error,
        )

    def _apply_wages_due(self, data: Any) -> None:
        info = details_of(data, "wagesDue", "data")
        amount = info.get("amount") or info.get("balance") or info.get("wagesDue")
        as_of = info.get("asOf") or "-"
        self.wages_label.setText(f"Wages due: {format_money(amount)} | As of: {as_of}")

    def create_component(self) -> None:
        if not self.session.has_permission("payroll:run"):
            self.banner.show_error("Your role cannot change wage components.")
            return
        dialog = WageComponentDialog(self)
        if not dialog.exec():
            return
        payload = dialog.payload
        run_async(
            lambda: self.session.accounts.create_wage_component(payload),
            lambda _result: self._on_success("Wage component created."),
            self._on_error,
        )

    def _on_success(self, message: str) -> None:
        self.banner.show_success(message)
        self.refresh()

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))
