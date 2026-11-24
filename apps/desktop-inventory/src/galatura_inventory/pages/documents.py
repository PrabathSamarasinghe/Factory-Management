"""Shared table and approval flow for inventory transaction pages."""

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
    ghost_button,
    primary_button,
    run_async,
)
from PySide6.QtWidgets import QHBoxLayout, QVBoxLayout, QWidget

from .common import row_id, rows_of


class DocumentPage(QWidget):
    def __init__(
        self,
        session: SessionManager,
        *,
        title: str,
        subtitle: str,
        columns: tuple[tuple[str, str, int], ...],
        list_method: str,
        list_key: str,
        create_method: str,
        approve_method: str,
        read_permission: str | None,
        create_permission: str,
        approve_permission: str,
        noun: str,
    ) -> None:
        super().__init__()
        self.session = session
        self.list_method = list_method
        self.list_key = list_key
        self.create_method = create_method
        self.approve_method = approve_method
        self.read_permission = read_permission
        self.create_permission = create_permission
        self.approve_permission = approve_permission
        self.noun = noun
        self.references: dict[str, Any] = {}

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(12)

        self.header = PageHeader(title, subtitle)
        self.refresh_button = ghost_button("Refresh")
        self.refresh_button.clicked.connect(self.refresh)
        self.header.add_action(self.refresh_button)
        layout.addWidget(self.header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        self.table = DataTable(columns)
        self.table.itemSelectionChanged.connect(self._update_actions)
        layout.addWidget(self.table, 1)

        actions = QHBoxLayout()
        actions.setSpacing(8)
        self.new_button = primary_button(f"New {noun}")
        self.new_button.clicked.connect(self.create_document)
        self.approve_button = primary_button(f"Approve {noun}")
        self.approve_button.clicked.connect(self.approve_selected)
        actions.addWidget(self.new_button)
        actions.addWidget(self.approve_button)
        actions.addStretch(1)
        layout.addLayout(actions)

        self._update_actions()

    def refresh(self) -> None:
        self.banner.clear()
        if self.read_permission and not self.session.has_permission(self.read_permission):
            self.banner.show_error(f"Your role does not include {self.read_permission}.")
            return
        run_async(self._load, self._apply, self._on_error)

    def _load(self) -> dict[str, Any]:
        try:
            documents = getattr(self.session.inventory, self.list_method)() or []
        except ApiError:
            documents = []
        return {"documents": documents, "references": self.load_references()}

    def load_references(self) -> dict[str, Any]:
        return {}

    def _apply(self, data: dict[str, Any]) -> None:
        references = data.get("references")
        self.references = references if isinstance(references, dict) else {}
        documents = rows_of(data.get("documents"), self.list_key)
        self._format_rows(documents)
        self.table.set_rows(documents)
        self._update_actions()
        self.banner.show_info(f"{len(documents)} {self.noun}(s).")

    def _format_rows(self, documents: list[dict[str, Any]]) -> None:
        del documents

    def _update_actions(self) -> None:
        selected = row_id(self.table.selected_row())
        self.new_button.setEnabled(self.session.has_permission(self.create_permission))
        self.approve_button.setEnabled(
            self.session.has_permission(self.approve_permission) and bool(selected)
        )

    def create_dialog(self) -> FormDialog | None:
        return None

    def create_document(self) -> None:
        if not self.session.has_permission(self.create_permission):
            self.banner.show_error(f"Your role does not include {self.create_permission}.")
            return
        dialog = self.create_dialog()
        if dialog is None or not dialog.exec():
            return
        payload = dialog.payload
        key = str(uuid4())
        run_async(
            lambda: getattr(self.session.inventory, self.create_method)(payload, key),
            lambda _result: self._on_success(f"{self.noun.title()} created."),
            self._on_error,
        )

    def approve_selected(self) -> None:
        if not self.session.has_permission(self.approve_permission):
            self.banner.show_error(f"Your role does not include {self.approve_permission}.")
            return
        selected = self.table.selected_row()
        identifier = row_id(selected)
        if not identifier:
            self.banner.show_info("Select a document first.")
            return
        if not confirm(self, "Approve document", f"Approve this {self.noun}?"):
            return
        key = str(uuid4())
        run_async(
            lambda: getattr(self.session.inventory, self.approve_method)(identifier, key),
            lambda _result: self._on_success(f"{self.noun.title()} approved."),
            self._on_error,
        )

    def _on_success(self, message: str) -> None:
        self.banner.show_success(message)
        self.refresh()

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))
