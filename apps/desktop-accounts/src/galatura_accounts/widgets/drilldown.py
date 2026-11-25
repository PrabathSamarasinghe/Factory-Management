"""Drill-down viewer from report rows to ledger lines, journal entries and sources."""

from __future__ import annotations

import json
from typing import Any

from galatura_desktop_core import SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    StatusBanner,
    format_date,
    format_money,
    ghost_button,
    primary_button,
    run_async,
)
from PySide6.QtWidgets import (
    QDialog,
    QHBoxLayout,
    QLabel,
    QTabWidget,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from ..pages.common import account_id_of, details_of, entry_id_of, rows_of


class DrilldownDialog(QDialog):
    def __init__(self, session: SessionManager, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.session = session
        self.entry_id = ""
        self.account_id = ""
        self.setWindowTitle("Drill down")
        self.resize(940, 640)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 16, 18, 16)
        layout.setSpacing(10)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)
        self.context_label = QLabel("No drill-down target loaded.")
        self.context_label.setObjectName("Subtitle")
        layout.addWidget(self.context_label)

        tabs = QTabWidget()
        ledger_tab = QWidget()
        ledger_layout = QVBoxLayout(ledger_tab)
        ledger_layout.setContentsMargins(0, 0, 0, 0)
        self.ledger_table = DataTable(
            [
                ("date", "Date", 110),
                ("description", "Description", 280),
                ("account", "Account", 200),
                ("debit", "Debit", 130),
                ("credit", "Credit", 130),
                ("balance", "Balance", 140),
                ("entryId", "Journal entry", 200),
            ]
        )
        for key in ("debit", "credit", "balance"):
            self.ledger_table.set_formatter(key, lambda value, _row: format_money(value))
        self.ledger_table.doubleClicked.connect(self.open_selected_entry)
        ledger_layout.addWidget(self.ledger_table, 1)
        tabs.addTab(ledger_tab, "Ledger")

        entry_tab = QWidget()
        entry_layout = QVBoxLayout(entry_tab)
        entry_layout.setContentsMargins(0, 0, 0, 0)
        self.entry_table = DataTable(
            [
                ("lineNo", "Line", 70),
                ("account", "Account", 240),
                ("memo", "Memo", 260),
                ("debit", "Debit", 140),
                ("credit", "Credit", 140),
            ]
        )
        for key in ("debit", "credit"):
            self.entry_table.set_formatter(key, lambda value, _row: format_money(value))
        entry_layout.addWidget(self.entry_table, 1)
        tabs.addTab(entry_tab, "Journal entry")

        source_tab = QWidget()
        source_layout = QVBoxLayout(source_tab)
        source_layout.setContentsMargins(0, 0, 0, 0)
        self.source_view = QTextEdit()
        self.source_view.setReadOnly(True)
        self.source_view.setPlaceholderText("Source document data appears here.")
        source_layout.addWidget(self.source_view, 1)
        tabs.addTab(source_tab, "Source document")
        layout.addWidget(tabs, 1)

        actions = QHBoxLayout()
        actions.setSpacing(8)
        self.ledger_button = ghost_button("Load ledger")
        self.ledger_button.clicked.connect(self.load_ledger)
        self.entry_button = primary_button("Open journal entry")
        self.entry_button.clicked.connect(self.open_selected_entry)
        self.source_button = primary_button("Open source document")
        self.source_button.clicked.connect(self.open_source)
        close_button = ghost_button("Close")
        close_button.clicked.connect(self.reject)
        for button in (
            self.ledger_button,
            self.entry_button,
            self.source_button,
            close_button,
        ):
            actions.addWidget(button)
        actions.addStretch(1)
        layout.addLayout(actions)

        self._update_actions()

    def open_target(self, target: Any) -> bool:
        info = details_of(target, "drilldown", "drill", "data")
        entry_id = entry_id_of(info)
        account_id = account_id_of(info)
        if entry_id:
            self.show_journal_entry(entry_id)
            if isinstance(info, dict) and (info.get("sourceId") or info.get("sourceType")):
                self.open_source()
            return True
        if account_id:
            self.show_ledger(
                account_id,
                from_date=str(info.get("from") or info.get("fromDate") or "") or None,
                to_date=str(info.get("to") or info.get("toDate") or "") or None,
                as_of=str(info.get("asOf") or "") or None,
            )
            return True
        self.banner.show_error("The drill-down target did not include an account or entry ID.")
        return False

    def show_ledger(
        self,
        account_id: str,
        *,
        from_date: str | None = None,
        to_date: str | None = None,
        as_of: str | None = None,
    ) -> None:
        self.banner.clear()
        if not self.session.has_permission("ledger:read"):
            self.banner.show_error("Your role does not include ledger:read.")
            return
        if not account_id:
            self.banner.show_info("Select an account first.")
            return
        self.account_id = account_id
        self.context_label.setText(f"Ledger: {account_id}")
        run_async(
            lambda: self.session.accounts.ledger(
                account_id,
                from_date=from_date,
                to_date=to_date,
                as_of=as_of,
                party_id=None,
            ),
            self._apply_ledger,
            self._on_error,
        )

    def _apply_ledger(self, data: Any) -> None:
        rows: list[dict[str, Any]] = []
        for line in rows_of(data, "lines", "entries", "rows", "data"):
            entry_id = entry_id_of(line)
            account = line.get("account") if isinstance(line.get("account"), dict) else {}
            rows.append(
                {
                    **line,
                    "date": format_date(line.get("date") or line.get("entryDate")),
                    "description": line.get("description") or line.get("memo") or "-",
                    "account": account.get("code")
                    or account.get("name")
                    or line.get("accountLabel")
                    or "-",
                    "entryId": entry_id,
                }
            )
        self.ledger_table.set_rows(rows)
        self.banner.show_success(f"Loaded {len(rows)} ledger line(s).")

    def load_ledger(self) -> None:
        if self.account_id:
            self.show_ledger(self.account_id)

    def open_selected_entry(self) -> None:
        selected = self.ledger_table.selected_row()
        entry_id = entry_id_of(selected) if selected else ""
        if not entry_id and selected:
            entry_id = str(selected.get("entryId") or "")
        if not entry_id:
            self.banner.show_info("Select a ledger line with a journal entry ID.")
            return
        self.show_journal_entry(entry_id)

    def show_journal_entry(self, entry_id: str) -> None:
        self.banner.clear()
        if not self.session.has_permission("ledger:read"):
            self.banner.show_error("Your role cannot read journal entries.")
            return
        if not entry_id:
            self.banner.show_info("Select a journal entry first.")
            return
        self.entry_id = entry_id
        self.context_label.setText(f"Journal entry: {entry_id}")
        run_async(
            lambda: self.session.accounts.journal_entry(entry_id),
            self._apply_entry,
            self._on_error,
        )

    def _apply_entry(self, data: Any) -> None:
        info = details_of(data, "entry", "journalEntry", "data")
        description = info.get("description") or info.get("memo") or "-"
        status = info.get("status") or "-"
        self.context_label.setText(
            f"Journal entry {self.entry_id}: {description} ({status})"
        )
        rows: list[dict[str, Any]] = []
        for line in rows_of(info, "lines", "journalLines", "rows", "data"):
            account = line.get("account") if isinstance(line.get("account"), dict) else {}
            rows.append(
                {
                    **line,
                    "lineNo": line.get("lineNo") or line.get("lineNumber") or "",
                    "account": account.get("code")
                    or account.get("name")
                    or line.get("accountLabel")
                    or "-",
                    "memo": line.get("memo") or line.get("description") or "",
                }
            )
        self.entry_table.set_rows(rows)
        self._update_actions()
        self.banner.show_success(f"Loaded {len(rows)} journal line(s).")

    def open_source(self) -> None:
        self.banner.clear()
        if not self.session.has_permission("ledger:read"):
            self.banner.show_error("Your role cannot read source documents.")
            return
        entry_id = self.entry_id
        selected = self.ledger_table.selected_row()
        if not entry_id and selected:
            entry_id = entry_id_of(selected)
        if not entry_id:
            self.banner.show_info("Load a journal entry first.")
            return
        self.entry_id = entry_id
        self.context_label.setText(f"Source document for journal entry: {entry_id}")
        run_async(
            lambda: self.session.accounts.journal_entry_source(entry_id),
            self._apply_source,
            self._on_error,
        )

    def _apply_source(self, data: Any) -> None:
        text = data if isinstance(data, str) else json.dumps(data, indent=2, default=str)
        self.source_view.setText(text)
        self.banner.show_success("Source document loaded.")

    def _update_actions(self) -> None:
        can_read = self.session.has_permission("ledger:read")
        self.ledger_button.setEnabled(can_read and bool(self.account_id))
        self.entry_button.setEnabled(can_read and bool(self.entry_id))
        self.source_button.setEnabled(can_read and bool(self.entry_id))

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))
