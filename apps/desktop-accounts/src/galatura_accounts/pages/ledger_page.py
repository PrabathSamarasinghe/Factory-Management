"""General ledger and two-column T-account viewer."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import ApiError, SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    PageHeader,
    StatusBanner,
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

from ..widgets.drilldown import DrilldownDialog
from ..widgets.t_account_widget import TAccountWidget
from .common import account_label, entry_id_of, flatten_accounts, rows_of


class LedgerPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session
        self.accounts: list[dict[str, Any]] = []

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(14)

        header = PageHeader(
            "Ledger & T-account",
            "Inspect posted lines for one account with a running balance.",
        )
        self.refresh_button = ghost_button("Refresh accounts")
        self.refresh_button.clicked.connect(self.refresh)
        header.add_action(self.refresh_button)
        layout.addWidget(header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        filters = QHBoxLayout()
        filters.setSpacing(8)
        filters.addWidget(QLabel("Account"))
        self.account_combo = QComboBox()
        self.account_combo.setMinimumWidth(320)
        filters.addWidget(self.account_combo, 2)
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
        layout.addLayout(filters)

        filters_two = QHBoxLayout()
        filters_two.setSpacing(8)
        filters_two.addWidget(QLabel("As of"))
        self.as_of_input = QLineEdit()
        self.as_of_input.setPlaceholderText("YYYY-MM-DD")
        self.as_of_input.setMaximumWidth(140)
        filters_two.addWidget(self.as_of_input)
        filters_two.addWidget(QLabel("Party ID"))
        self.party_input = QLineEdit()
        self.party_input.setPlaceholderText("Optional")
        self.party_input.setMaximumWidth(240)
        filters_two.addWidget(self.party_input)
        self.ledger_button = primary_button("Load ledger")
        self.ledger_button.clicked.connect(self.load_ledger)
        self.t_account_button = primary_button("Load T-account")
        self.t_account_button.clicked.connect(self.load_t_account)
        self.journal_button = ghost_button("Open journal entry")
        self.journal_button.clicked.connect(self.open_journal_entry)
        self.source_button = ghost_button("Open source document")
        self.source_button.clicked.connect(self.open_source)
        filters_two.addWidget(self.ledger_button)
        filters_two.addWidget(self.t_account_button)
        filters_two.addWidget(self.journal_button)
        filters_two.addWidget(self.source_button)
        filters_two.addStretch(1)
        layout.addLayout(filters_two)

        ledger_frame = QFrame()
        ledger_frame.setObjectName("Panel")
        ledger_layout = QVBoxLayout(ledger_frame)
        ledger_layout.setContentsMargins(18, 16, 18, 16)
        ledger_layout.setSpacing(10)
        ledger_title = QLabel("General ledger")
        ledger_title.setObjectName("PageTitle")
        ledger_title.setStyleSheet("font-size: 12pt;")
        ledger_layout.addWidget(ledger_title)

        self.table = DataTable(
            [
                ("date", "Date", 110),
                ("description", "Description", 280),
                ("account", "Account", 220),
                ("party", "Party", 180),
                ("debit", "Debit", 130),
                ("credit", "Credit", 130),
                ("balance", "Balance", 140),
                ("entryId", "Journal entry", 200),
            ]
        )
        for key in ("debit", "credit", "balance"):
            self.table.set_formatter(key, lambda value, _row: format_money(value))
        self.table.itemSelectionChanged.connect(self._update_drill_actions)
        self.table.doubleClicked.connect(self.open_journal_entry)
        ledger_layout.addWidget(self.table, 1)
        layout.addWidget(ledger_frame, 2)

        t_frame = QFrame()
        t_frame.setObjectName("Panel")
        t_layout = QVBoxLayout(t_frame)
        t_layout.setContentsMargins(18, 16, 18, 16)
        t_layout.setSpacing(8)
        self.t_account = TAccountWidget(self)
        t_layout.addWidget(self.t_account, 1)
        layout.addWidget(t_frame, 1)

        can_read = self.session.has_permission("ledger:read")
        self.ledger_button.setEnabled(can_read)
        self.t_account_button.setEnabled(can_read)
        self.journal_button.setEnabled(can_read)
        self.source_button.setEnabled(can_read)
        self._update_drill_actions()

    def refresh(self) -> None:
        self.banner.clear()
        if not self.session.has_permission("ledger:read"):
            self.banner.show_error("Your role does not include ledger:read.")
            return
        run_async(self._load_accounts, self._apply_accounts, self._on_error)

    def _load_accounts(self) -> Any:
        try:
            return self.session.accounts.accounts_tree()
        except ApiError:
            return []

    def _apply_accounts(self, data: Any) -> None:
        self.accounts = flatten_accounts(data)
        selected = self.account_combo.currentData()
        self.account_combo.blockSignals(True)
        self.account_combo.clear()
        self.account_combo.addItem("Select account", None)
        for account in self.accounts:
            self.account_combo.addItem(account_label(account), account.get("id"))
        index = self.account_combo.findData(selected) if selected else -1
        self.account_combo.setCurrentIndex(index if index >= 0 else 0)
        self.account_combo.blockSignals(False)
        self.banner.show_info(f"{len(self.accounts)} account(s) available.")

    def _selected_account_id(self) -> str:
        return str(self.account_combo.currentData() or "")

    def load_ledger(self) -> None:
        if not self.session.has_permission("ledger:read"):
            self.banner.show_error("Your role cannot read the ledger.")
            return
        account_id = self._selected_account_id()
        if not account_id:
            self.banner.show_info("Select an account first.")
            return
        run_async(lambda: self._load_ledger(account_id), self._apply_ledger, self._on_error)

    def _load_ledger(self, account_id: str) -> Any:
        return self.session.accounts.ledger(
            account_id,
            from_date=self.from_input.text().strip() or None,
            to_date=self.to_input.text().strip() or None,
            as_of=self.as_of_input.text().strip() or None,
            party_id=self.party_input.text().strip() or None,
        )

    def _apply_ledger(self, data: Any) -> None:
        rows: list[dict[str, Any]] = []
        for line in rows_of(data, "lines", "entries", "rows", "data"):
            account = line.get("account") if isinstance(line.get("account"), dict) else {}
            rows.append(
                {
                    **line,
                    "entryId": entry_id_of(line),
                    "date": format_date(line.get("date") or line.get("entryDate")),
                    "description": line.get("description") or line.get("memo") or "-",
                    "account": (
                        account.get("code")
                        or account.get("name")
                        or line.get("accountLabel")
                        or "-"
                    ),
                    "party": line.get("partyName") or line.get("partyId") or "-",
                }
            )
        self.table.set_rows(rows)
        self._update_drill_actions()
        self.banner.show_success(f"Loaded {len(rows)} ledger line(s).")

    def _update_drill_actions(self) -> None:
        selected = self.table.selected_row()
        entry_id = entry_id_of(selected) if selected else ""
        if not entry_id and selected:
            entry_id = str(selected.get("entryId") or "")
        can_read = self.session.has_permission("ledger:read")
        self.journal_button.setEnabled(can_read and bool(entry_id))
        self.source_button.setEnabled(can_read and bool(entry_id))

    def _selected_entry_id(self) -> str:
        selected = self.table.selected_row()
        if not selected:
            return ""
        return entry_id_of(selected) or str(selected.get("entryId") or "")

    def open_journal_entry(self) -> None:
        if not self.session.has_permission("ledger:read"):
            self.banner.show_error("Your role cannot read journal entries.")
            return
        entry_id = self._selected_entry_id()
        if not entry_id:
            self.banner.show_info("Select a ledger line with a journal entry ID.")
            return
        dialog = DrilldownDialog(self.session, self)
        self._drilldown_dialog = dialog
        dialog.show()
        dialog.show_journal_entry(entry_id)

    def open_source(self) -> None:
        if not self.session.has_permission("ledger:read"):
            self.banner.show_error("Your role cannot read source documents.")
            return
        entry_id = self._selected_entry_id()
        if not entry_id:
            self.banner.show_info("Select a ledger line with a journal entry ID.")
            return
        dialog = DrilldownDialog(self.session, self)
        self._drilldown_dialog = dialog
        dialog.entry_id = entry_id
        dialog.show()
        dialog.open_source()

    def load_t_account(self) -> None:
        if not self.session.has_permission("ledger:read"):
            self.banner.show_error("Your role cannot read T-accounts.")
            return
        account_id = self._selected_account_id()
        if not account_id:
            self.banner.show_info("Select an account first.")
            return
        run_async(
            lambda: self.session.accounts.t_account(
                account_id,
                as_of=self.as_of_input.text().strip() or None,
            ),
            self.t_account.set_data,
            self._on_error,
        )

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))
