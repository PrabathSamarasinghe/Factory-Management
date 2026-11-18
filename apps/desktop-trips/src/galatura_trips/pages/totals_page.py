"""Daily collection totals and per-supplier statements."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import ApiError, SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    PageHeader,
    StatusBanner,
    format_bool,
    format_date,
    format_datetime,
    ghost_button,
    primary_button,
    run_async,
    title_case,
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


def _supplier_label(person: dict[str, Any]) -> str:
    supplier = person.get("supplierDetails") or {}
    name = person.get("fullName") or person.get("code") or person.get("id") or "-"
    reg_no = supplier.get("supplierRegNo") or "-"
    return f"{reg_no} - {name}"


class TotalsPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session
        self.suppliers: list[dict[str, Any]] = []

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(16)

        header = PageHeader(
            "Daily Totals",
            "Finalised supplier weights and statements from the collection service.",
        )
        self.refresh_button = ghost_button("Refresh")
        self.refresh_button.clicked.connect(self.refresh)
        header.add_action(self.refresh_button)
        layout.addWidget(header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        totals_frame = QFrame()
        totals_frame.setObjectName("Panel")
        totals_layout = QVBoxLayout(totals_frame)
        totals_layout.setContentsMargins(18, 16, 18, 16)
        totals_layout.setSpacing(10)
        totals_title = QLabel("Finalised daily totals")
        totals_title.setObjectName("PageTitle")
        totals_title.setStyleSheet("font-size: 12pt;")
        totals_layout.addWidget(totals_title)

        totals_filters = QHBoxLayout()
        totals_filters.setSpacing(8)
        totals_filters.addWidget(QLabel("Date"))
        self.date_input = QLineEdit()
        self.date_input.setPlaceholderText("YYYY-MM-DD")
        self.date_input.setMaximumWidth(140)
        self.date_input.returnPressed.connect(self.load_totals)
        totals_filters.addWidget(self.date_input)
        totals_filters.addWidget(QLabel("Supplier"))
        self.totals_supplier_combo = QComboBox()
        self.totals_supplier_combo.setEditable(True)
        self.totals_supplier_combo.addItem("All suppliers", None)
        self.totals_supplier_combo.setMinimumWidth(260)
        totals_filters.addWidget(self.totals_supplier_combo, 1)
        self.apply_button = primary_button("Apply")
        self.apply_button.clicked.connect(self.load_totals)
        totals_filters.addWidget(self.apply_button)
        totals_layout.addLayout(totals_filters)

        self.totals_table = DataTable(
            [
                ("supplierLabel", "Supplier", 260),
                ("collectionDate", "Date", 120),
                ("totalNetKg", "Net kg", 120),
                ("totalBags", "Bags", 90),
                ("finalized", "Finalised", 100),
                ("finalizedAt", "Finalised at", 170),
                ("smsStatus", "SMS", 120),
            ]
        )
        self.totals_table.set_formatter("collectionDate", lambda value, _row: format_date(value))
        self.totals_table.set_formatter(
            "finalized", lambda value, _row: format_bool(value)
        )
        self.totals_table.set_formatter("finalizedAt", lambda value, _row: format_datetime(value))
        self.totals_table.set_formatter("smsStatus", lambda value, _row: title_case(value))
        totals_layout.addWidget(self.totals_table, 1)
        layout.addWidget(totals_frame, 1)

        statement_frame = QFrame()
        statement_frame.setObjectName("Panel")
        statement_layout = QVBoxLayout(statement_frame)
        statement_layout.setContentsMargins(18, 16, 18, 16)
        statement_layout.setSpacing(10)
        statement_title = QLabel("Supplier statement")
        statement_title.setObjectName("PageTitle")
        statement_title.setStyleSheet("font-size: 12pt;")
        statement_layout.addWidget(statement_title)

        statement_filters = QHBoxLayout()
        statement_filters.setSpacing(8)
        statement_filters.addWidget(QLabel("Supplier"))
        self.statement_supplier_combo = QComboBox()
        self.statement_supplier_combo.setEditable(True)
        self.statement_supplier_combo.addItem("Select supplier", None)
        self.statement_supplier_combo.setMinimumWidth(260)
        statement_filters.addWidget(self.statement_supplier_combo, 1)
        statement_filters.addWidget(QLabel("From"))
        self.from_input = QLineEdit()
        self.from_input.setPlaceholderText("YYYY-MM-DD")
        self.from_input.setMaximumWidth(140)
        statement_filters.addWidget(self.from_input)
        statement_filters.addWidget(QLabel("To"))
        self.to_input = QLineEdit()
        self.to_input.setPlaceholderText("YYYY-MM-DD")
        self.to_input.setMaximumWidth(140)
        statement_filters.addWidget(self.to_input)
        self.statement_button = primary_button("Load statement")
        self.statement_button.clicked.connect(self.load_statement)
        statement_filters.addWidget(self.statement_button)
        statement_layout.addLayout(statement_filters)

        self.statement_table = DataTable(
            [
                ("collectionDate", "Date", 120),
                ("totalNetKg", "Net kg", 120),
                ("totalBags", "Bags", 90),
                ("tripId", "Trip ID", 250),
                ("finalized", "Finalised", 100),
                ("smsStatus", "SMS", 120),
            ]
        )
        self.statement_table.set_formatter(
            "collectionDate", lambda value, _row: format_date(value)
        )
        self.statement_table.set_formatter(
            "finalized", lambda value, _row: format_bool(value)
        )
        self.statement_table.set_formatter("smsStatus", lambda value, _row: title_case(value))
        statement_layout.addWidget(self.statement_table, 1)
        layout.addWidget(statement_frame, 1)

    def refresh(self) -> None:
        self.banner.clear()
        if not self.session.has_permission("collection:review"):
            self.banner.show_error("Your role cannot review collection totals.")
            return
        run_async(self._load_overview, self._apply_overview, self._on_error)

    def _load_overview(self) -> dict[str, Any]:
        suppliers: list[dict[str, Any]] = []
        try:
            result = (
                self.session.people.list_persons(person_type="SUPPLIER", limit=200) or {}
            )
            suppliers = list(result.get("data") or [])
        except ApiError:
            suppliers = []
        date = self.date_input.text().strip() or None
        supplier_id = self._selected_supplier_id(self.totals_supplier_combo, "All suppliers")
        totals = self.session.collection.daily_totals(date=date, supplier_id=supplier_id) or []
        return {"suppliers": suppliers, "totals": totals}

    def _apply_overview(self, data: dict[str, Any]) -> None:
        self.suppliers = list(data.get("suppliers") or [])
        self._populate_suppliers(
            self.totals_supplier_combo, "All suppliers", self.suppliers
        )
        self._populate_suppliers(
            self.statement_supplier_combo, "Select supplier", self.suppliers
        )
        names = {
            str(person.get("id")): _supplier_label(person)
            for person in self.suppliers
            if person.get("id")
        }
        rows = []
        for total in data.get("totals") or []:
            supplier_id = str(total.get("supplierId") or "")
            rows.append(
                {
                    **total,
                    "supplierLabel": names.get(supplier_id, supplier_id or "-"),
                }
            )
        self.totals_table.set_rows(rows)
        self.banner.show_info(f"{len(rows)} daily total(s).")

    def _populate_suppliers(
        self,
        combo: QComboBox,
        empty_label: str,
        suppliers: list[dict[str, Any]],
    ) -> None:
        selected = combo.currentData()
        text = combo.currentText()
        combo.blockSignals(True)
        combo.clear()
        combo.addItem(empty_label, None)
        for person in suppliers:
            combo.addItem(_supplier_label(person), person.get("id"))
        index = combo.findData(selected) if selected else -1
        if index >= 0:
            combo.setCurrentIndex(index)
        elif text and text != empty_label:
            match = combo.findText(text)
            if match >= 0:
                combo.setCurrentIndex(match)
            else:
                combo.setEditText(text)
        combo.blockSignals(False)

    def _selected_supplier_id(self, combo: QComboBox, empty_label: str) -> str | None:
        data = combo.currentData()
        if data:
            return str(data)
        text = combo.currentText().strip()
        if not text or text == empty_label:
            return None
        return text

    def load_totals(self) -> None:
        if not self.session.has_permission("collection:review"):
            self.banner.show_error("Your role cannot review collection totals.")
            return
        date = self.date_input.text().strip() or None
        supplier_id = self._selected_supplier_id(self.totals_supplier_combo, "All suppliers")
        run_async(
            lambda: self.session.collection.daily_totals(date=date, supplier_id=supplier_id),
            self._apply_totals,
            self._on_error,
        )

    def _apply_totals(self, totals: list[dict[str, Any]]) -> None:
        names = {
            str(person.get("id")): _supplier_label(person)
            for person in self.suppliers
            if person.get("id")
        }
        rows = []
        for total in totals or []:
            supplier_id = str(total.get("supplierId") or "")
            rows.append(
                {
                    **total,
                    "supplierLabel": names.get(supplier_id, supplier_id or "-"),
                }
            )
        self.totals_table.set_rows(rows)
        self.banner.show_info(f"{len(rows)} daily total(s).")

    def load_statement(self) -> None:
        if not self.session.has_permission("collection:review"):
            self.banner.show_error("Your role cannot review supplier statements.")
            return
        supplier_id = self._selected_supplier_id(
            self.statement_supplier_combo, "Select supplier"
        )
        if not supplier_id:
            self.banner.show_info("Select a supplier first.")
            return
        from_date = self.from_input.text().strip() or None
        to_date = self.to_input.text().strip() or None
        run_async(
            lambda: self.session.collection.statement(supplier_id, from_date, to_date),
            self._apply_statement,
            self._on_error,
        )

    def _apply_statement(self, rows: list[dict[str, Any]]) -> None:
        self.statement_table.set_rows(rows or [])
        self.banner.show_success(f"Loaded {len(rows or [])} statement line(s).")

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))
