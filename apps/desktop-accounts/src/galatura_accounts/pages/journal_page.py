"""Journal drafts, posting, reversals, opening entries and posting rules."""

from __future__ import annotations

from typing import Any
from uuid import uuid4

from galatura_desktop_core import ApiError, SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    FormDialog,
    PageHeader,
    StatusBanner,
    confirm,
    danger_button,
    format_date,
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
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

from ..widgets.journal_entry_editor import JournalEntryEditor, OpeningEntryDialog
from .common import required_text, row_id, rows_of


class ReverseDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("Reverse journal entry", parent)
        self.reason_input = QTextEdit()
        self.reason_input.setMinimumHeight(90)
        self.add_row("Reason", self.reason_input)

    def validate(self) -> str | None:
        if not self.reason_input.toPlainText().strip():
            return "A reversal reason is required."
        return None

    def collect(self) -> dict[str, Any]:
        return {"reason": self.reason_input.toPlainText().strip()}


class PostingRuleDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("New posting rule", parent)
        self.event_input = QLineEdit()
        self.version_input = QLineEdit("1")
        self.effective_input = QLineEdit()
        self.effective_input.setPlaceholderText("YYYY-MM-DD (optional)")
        self.debit_input = QLineEdit()
        self.credit_input = QLineEdit()
        self.condition_input = QTextEdit()
        self.condition_input.setPlaceholderText("Optional JSON condition")
        self.approver_input = QLineEdit()
        self.add_row("Event type", self.event_input)
        self.add_row("Version", self.version_input)
        self.add_row("Effective from", self.effective_input)
        self.add_row("Debit account ID", self.debit_input)
        self.add_row("Credit account ID", self.credit_input)
        self.add_row("Condition JSON", self.condition_input)
        self.add_row("Approver", self.approver_input)

    def validate(self) -> str | None:
        try:
            required_text(self.event_input.text(), "Event type")
            required_text(self.debit_input.text(), "Debit account ID")
            required_text(self.credit_input.text(), "Credit account ID")
            int(required_text(self.version_input.text(), "Version"))
            condition = self.condition_input.toPlainText().strip()
            if condition:
                import json

                json.loads(condition)
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "eventType": self.event_input.text().strip(),
            "version": int(self.version_input.text().strip()),
            "debitAccountId": self.debit_input.text().strip(),
            "creditAccountId": self.credit_input.text().strip(),
        }
        effective = self.effective_input.text().strip()
        condition = self.condition_input.toPlainText().strip()
        approver = self.approver_input.text().strip()
        if effective:
            payload["effectiveFrom"] = effective
        if condition:
            payload["conditionJson"] = condition
        if approver:
            payload["approver"] = approver
        return payload


class JournalPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(12)

        header = PageHeader(
            "Journal",
            "Draft balanced entries, post or reverse them, and maintain posting rules.",
        )
        self.refresh_button = ghost_button("Refresh")
        self.refresh_button.clicked.connect(self.refresh)
        header.add_action(self.refresh_button)
        layout.addWidget(header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        self.table = DataTable(
            [
                ("entryDate", "Date", 110),
                ("description", "Description", 260),
                ("status", "Status", 110),
                ("sourceType", "Source", 120),
                ("debitTotal", "Debit", 130),
                ("creditTotal", "Credit", 130),
                ("id", "Entry ID", 220),
            ]
        )
        self.table.set_formatter("entryDate", lambda value, _row: format_date(value))
        for key in ("debitTotal", "creditTotal"):
            self.table.set_formatter(key, lambda value, _row: format_money(value))
        self.table.itemSelectionChanged.connect(self._on_selection_changed)
        layout.addWidget(self.table, 1)

        editor_frame = QFrame()
        editor_frame.setObjectName("Panel")
        editor_layout = QVBoxLayout(editor_frame)
        editor_layout.setContentsMargins(18, 16, 18, 16)
        editor_layout.setSpacing(8)
        editor_title = QLabel("Journal entry editor")
        editor_title.setObjectName("PageTitle")
        editor_title.setStyleSheet("font-size: 12pt;")
        editor_layout.addWidget(editor_title)
        self.editor = JournalEntryEditor(self)
        editor_layout.addWidget(self.editor, 1)
        layout.addWidget(editor_frame, 2)

        actions = QHBoxLayout()
        self.new_button = ghost_button("New draft")
        self.new_button.clicked.connect(lambda: self.editor.clear())
        self.draft_button = primary_button("Save draft")
        self.draft_button.clicked.connect(self.save_draft)
        self.opening_button = primary_button("Post opening")
        self.opening_button.clicked.connect(self.post_opening)
        self.post_button = primary_button("Post selected")
        self.post_button.clicked.connect(self.post_selected)
        self.reverse_button = danger_button("Reverse selected")
        self.reverse_button.clicked.connect(self.reverse_selected)
        for button in (
            self.new_button,
            self.draft_button,
            self.opening_button,
            self.post_button,
            self.reverse_button,
        ):
            actions.addWidget(button)
        actions.addStretch(1)
        layout.addLayout(actions)

        rules_frame = QFrame()
        rules_frame.setObjectName("Panel")
        rules_layout = QVBoxLayout(rules_frame)
        rules_layout.setContentsMargins(18, 16, 18, 16)
        rules_layout.setSpacing(8)
        rules_title = QLabel("Posting rules")
        rules_title.setObjectName("PageTitle")
        rules_title.setStyleSheet("font-size: 12pt;")
        rules_layout.addWidget(rules_title)
        self.rules_table = DataTable(
            [
                ("eventType", "Event", 180),
                ("version", "Version", 80),
                ("effectiveFrom", "Effective", 120),
                ("debitAccountId", "Debit account", 200),
                ("creditAccountId", "Credit account", 200),
                ("status", "Status", 110),
                ("id", "ID", 200),
            ]
        )
        rules_layout.addWidget(self.rules_table, 1)
        rules_actions = QHBoxLayout()
        self.new_rule_button = primary_button("New rule")
        self.new_rule_button.clicked.connect(self.create_rule)
        rules_actions.addWidget(self.new_rule_button)
        rules_actions.addStretch(1)
        rules_layout.addLayout(rules_actions)
        layout.addWidget(rules_frame, 1)

        self.editor.changed.connect(self._update_actions)
        self._update_actions()

    def refresh(self) -> None:
        self.banner.clear()
        if not self.session.has_permission("ledger:read"):
            self.banner.show_error("Your role does not include ledger:read.")
            return
        run_async(self._load, self._apply, self._on_error)

    def _load(self) -> dict[str, Any]:
        entries = self.session.accounts.list_journal_entries() or []
        accounts: Any = []
        try:
            accounts = self.session.accounts.accounts_tree()
        except ApiError:
            accounts = []
        rules: list[dict[str, Any]] = []
        if self.session.has_permission("rules:read"):
            rules = self.session.accounts.list_posting_rules() or []
        return {"entries": entries, "accounts": accounts, "rules": rules}

    def _apply(self, data: dict[str, Any]) -> None:
        entries = rows_of(data.get("entries"), "entries", "data")
        self.table.set_rows(entries)
        self.editor.set_accounts(data.get("accounts"))
        self.rules_table.set_rows(rows_of(data.get("rules"), "rules", "data"))
        self._update_actions()
        self.banner.show_info(f"{len(entries)} journal entr(y/ies).")

    def _on_selection_changed(self) -> None:
        selected = self.table.selected_row()
        if selected:
            self.editor.load_entry(selected)
        self._update_actions()

    def _update_actions(self) -> None:
        selected = self.table.selected_row()
        selected_id = row_id(selected) if selected else ""
        loaded_id = self.editor.entry_id or ""
        balanced = self.editor.is_balanced() if loaded_id and loaded_id == selected_id else True
        can_post = self.session.has_permission("ledger:post") and bool(selected_id) and balanced
        self.draft_button.setEnabled(self.session.has_permission("ledger:draft"))
        self.opening_button.setEnabled(
            self.session.has_permission("ledger:opening") and self.editor.is_balanced()
        )
        self.post_button.setEnabled(can_post)
        self.reverse_button.setEnabled(
            self.session.has_permission("ledger:reverse") and bool(selected_id)
        )
        self.new_rule_button.setEnabled(self.session.has_permission("rules:write"))

    def save_draft(self) -> None:
        if not self.session.has_permission("ledger:draft"):
            self.banner.show_error("Your role cannot draft journal entries.")
            return
        key = str(uuid4())
        try:
            payload = self.editor.payload(key)
        except ValueError as exc:
            self.banner.show_error(str(exc))
            return
        run_async(
            lambda: self.session.accounts.create_journal_entry(payload, key),
            lambda _result: self._on_success("Draft journal entry saved."),
            self._on_error,
        )

    def post_opening(self) -> None:
        if not self.session.has_permission("ledger:opening"):
            self.banner.show_error("Your role cannot post opening balances.")
            return
        dialog = OpeningEntryDialog(self)
        if not dialog.exec():
            return
        try:
            payload = self.editor.payload(str(uuid4()))
        except ValueError as exc:
            self.banner.show_error(str(exc))
            return
        payload.update(dialog.payload)
        run_async(
            lambda: self.session.accounts.post_opening_entry(payload, payload["idempotencyKey"]),
            lambda _result: self._on_success("Opening balance entry posted."),
            self._on_error,
        )

    def post_selected(self) -> None:
        if not self.session.has_permission("ledger:post"):
            self.banner.show_error("Your role cannot post journal entries.")
            return
        selected = self.table.selected_row()
        if not selected:
            self.banner.show_info("Select a journal entry first.")
            return
        entry_id = row_id(selected)
        if self.editor.entry_id == entry_id and not self.editor.is_balanced():
            self.banner.show_error("The entry must be balanced before it can be posted.")
            return
        if not confirm(self, "Post entry", "Post this journal entry to the ledger?"):
            return
        key = str(uuid4())
        run_async(
            lambda: self.session.accounts.post_journal_entry(entry_id, key),
            lambda _result: self._on_success("Journal entry posted."),
            self._on_error,
        )

    def reverse_selected(self) -> None:
        if not self.session.has_permission("ledger:reverse"):
            self.banner.show_error("Your role cannot reverse journal entries.")
            return
        selected = self.table.selected_row()
        if not selected:
            self.banner.show_info("Select a journal entry first.")
            return
        dialog = ReverseDialog(self)
        if not dialog.exec():
            return
        entry_id = row_id(selected)
        reason = dialog.payload["reason"]
        key = str(uuid4())
        run_async(
            lambda: self.session.accounts.reverse_journal_entry(
                entry_id, reason=reason, idempotency_key=key
            ),
            lambda _result: self._on_success("Journal entry reversed."),
            self._on_error,
        )

    def create_rule(self) -> None:
        if not self.session.has_permission("rules:write"):
            self.banner.show_error("Your role cannot change posting rules.")
            return
        dialog = PostingRuleDialog(self)
        if not dialog.exec():
            return
        payload = dialog.payload
        run_async(
            lambda: self.session.accounts.create_posting_rule(payload),
            lambda _result: self._on_success("Posting rule created."),
            self._on_error,
        )

    def _on_success(self, message: str) -> None:
        self.banner.show_success(message)
        self.editor.clear()
        self.refresh()

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))
