"""People and suppliers page."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    PageHeader,
    StatusBanner,
    danger_button,
    ghost_button,
    primary_button,
    run_async,
)
from PySide6.QtCore import QTimer
from PySide6.QtWidgets import (
    QComboBox,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QVBoxLayout,
    QWidget,
)

from ..dialogs.person_detail import PersonDetailDialog
from ..dialogs.person_form import PERSON_TYPES, PersonFormDialog

PERSON_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED", "TERMINATED"]


class PersonsPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session
        self._page = 1
        self._total_pages = 1

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(14)

        header = PageHeader(
            "People & Suppliers",
            "Employees, staff, suppliers and administrators in one registry.",
        )
        refresh = ghost_button("Refresh")
        refresh.clicked.connect(self.refresh)
        new_person = primary_button("New person")
        new_person.clicked.connect(self._new_person)
        header.add_action(refresh)
        header.add_action(new_person)
        layout.addWidget(header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        filters = QHBoxLayout()
        filters.setSpacing(8)
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("Search name, code or phone...")
        self.search_input.setClearButtonEnabled(True)
        self.search_input.returnPressed.connect(self._reset_and_refresh)
        self._search_timer = QTimer(self)
        self._search_timer.setSingleShot(True)
        self._search_timer.setInterval(350)
        self._search_timer.timeout.connect(self._reset_and_refresh)
        self.search_input.textChanged.connect(lambda _text: self._search_timer.start())

        self.type_combo = QComboBox()
        self.type_combo.addItem("All types", None)
        for person_type in PERSON_TYPES:
            self.type_combo.addItem(person_type.title(), person_type)
        self.type_combo.currentIndexChanged.connect(self._reset_and_refresh)

        self.status_combo = QComboBox()
        self.status_combo.addItem("Any status", None)
        for status in PERSON_STATUSES:
            self.status_combo.addItem(status.title(), status)
        self.status_combo.currentIndexChanged.connect(self._reset_and_refresh)

        filters.addWidget(self.search_input, 1)
        filters.addWidget(self.type_combo)
        filters.addWidget(self.status_combo)
        layout.addLayout(filters)

        self.table = DataTable(
            [
                ("code", "Code", 120),
                ("fullName", "Full name", 200),
                ("personType", "Type", 100),
                ("phonePrimary", "Phone", 130),
                ("status", "Status", 100),
                ("supplier_reg", "Supplier reg. no", 150),
                ("createdAt_text", "Created", 130),
            ]
        )
        self.table.itemSelectionChanged.connect(self._update_actions)
        self.table.itemDoubleClicked.connect(lambda _item: self._view_person())
        layout.addWidget(self.table, 1)

        footer = QHBoxLayout()
        footer.setSpacing(8)
        self.page_label = QLabel("Page 1 of 1")
        self.page_label.setObjectName("Muted")
        self.prev_button = ghost_button("Previous")
        self.prev_button.clicked.connect(self._prev_page)
        self.next_button = ghost_button("Next")
        self.next_button.clicked.connect(self._next_page)
        footer.addWidget(self.page_label)
        footer.addStretch(1)
        footer.addWidget(self.prev_button)
        footer.addWidget(self.next_button)
        layout.addLayout(footer)

        actions = QHBoxLayout()
        actions.setSpacing(8)
        actions.addStretch(1)
        self.view_button = primary_button("View details")
        self.view_button.clicked.connect(self._view_person)
        self.edit_button = ghost_button("Edit")
        self.edit_button.clicked.connect(self._edit_person)
        self.status_button = danger_button("Terminate")
        self.status_button.clicked.connect(self._terminate_person)
        actions.addWidget(self.view_button)
        actions.addWidget(self.edit_button)
        actions.addWidget(self.status_button)
        layout.addLayout(actions)

        self._update_actions()

    # ------------------------------------------------------------------ data
    def _reset_and_refresh(self) -> None:
        self._page = 1
        self.refresh()

    def refresh(self) -> None:
        self.banner.clear()
        query = self.search_input.text().strip() or None
        person_type = self.type_combo.currentData()
        status = self.status_combo.currentData()
        page = self._page
        run_async(
            lambda: self._load(query, person_type, status, page),
            self._apply,
            self._on_error,
        )

    def _load(
        self,
        query: str | None,
        person_type: str | None,
        status: str | None,
        page: int,
    ) -> dict[str, Any]:
        result = (
            self.session.people.list_persons(
                query=query,
                person_type=person_type,
                status=status,
                page=page,
                limit=25,
            )
            or {}
        )
        return result

    def _apply(self, data: dict[str, Any]) -> None:
        page_info = data.get("page") or {}
        self._page = int(page_info.get("current") or 1)
        self._total_pages = max(int(page_info.get("totalPages") or 1), 1)

        rows = []
        for person in data.get("data") or []:
            supplier = person.get("supplierDetails") or {}
            rows.append(
                {
                    **person,
                    "personType": str(person.get("personType") or "").title(),
                    "status": str(person.get("status") or "").title(),
                    "supplier_reg": supplier.get("supplierRegNo") or "-",
                    "createdAt_text": str(person.get("createdAt") or "")[:10],
                }
            )
        self.table.set_rows(rows)

        self.page_label.setText(
            f"Page {self._page} of {self._total_pages} "
            f"({page_info.get('total', len(rows))} records)"
        )
        self.prev_button.setEnabled(self._page > 1)
        self.next_button.setEnabled(self._page < self._total_pages)
        self._update_actions()

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))

    # --------------------------------------------------------------- actions
    def _selected(self) -> dict[str, Any] | None:
        return self.table.selected_row()

    def _update_actions(self) -> None:
        person = self._selected()
        enabled = person is not None
        self.view_button.setEnabled(enabled)
        self.edit_button.setEnabled(enabled)
        self.status_button.setEnabled(
            enabled and str(person.get("status")) != "TERMINATED"
        )

    def _new_person(self) -> None:
        dialog = PersonFormDialog(parent=self)
        if not dialog.exec():
            return
        payload = dialog.payload
        run_async(
            lambda: self.session.people.create_person(payload),
            self._after_change("Person created."),
            self._on_error,
        )

    def _edit_person(self) -> None:
        person = self._selected()
        if not person:
            return
        dialog = PersonFormDialog(person, self)
        if not dialog.exec():
            return
        payload = dialog.payload
        run_async(
            lambda: self.session.people.update_person(person["id"], payload),
            self._after_change("Person updated."),
            self._on_error,
        )

    def _view_person(self) -> None:
        person = self._selected()
        if not person:
            return
        dialog = PersonDetailDialog(self.session, person["id"], self)
        dialog.exec()
        self.refresh()

    def _terminate_person(self) -> None:
        person = self._selected()
        if not person:
            return
        from galatura_desktop_core.widgets import confirm

        if not confirm(
            self,
            "Terminate person",
            f"Mark {person.get('fullName')} as TERMINATED? This is recorded in the change log.",
        ):
            return
        run_async(
            lambda: self.session.people.update_status(person["id"], "TERMINATED"),
            self._after_change("Person terminated."),
            self._on_error,
        )

    def _after_change(self, message: str):
        def handler(_result: Any) -> None:
            self.banner.show_success(message)
            self.refresh()

        return handler

    def _prev_page(self) -> None:
        if self._page > 1:
            self._page -= 1
            self.refresh()

    def _next_page(self) -> None:
        if self._page < self._total_pages:
            self._page += 1
            self.refresh()
