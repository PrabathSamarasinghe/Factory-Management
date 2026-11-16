"""User administration page."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    PageHeader,
    StatusBanner,
    confirm,
    format_datetime,
    ghost_button,
    primary_button,
    run_async,
)
from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QComboBox,
    QHBoxLayout,
    QInputDialog,
    QLineEdit,
    QMessageBox,
    QVBoxLayout,
    QWidget,
)

from ..dialogs.user_dialogs import (
    AssignRolesDialog,
    CreateUserDialog,
    EditUserDialog,
)

USER_STATUSES = ["ACTIVE", "LOCKED", "DISABLED", "PENDING"]


class UsersPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session
        self._roles: list[dict[str, Any]] = []

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(14)

        header = PageHeader("Users", "Create accounts, assign roles and lock access.")
        refresh = ghost_button("Refresh")
        refresh.clicked.connect(self.refresh)
        new_user = primary_button("New user")
        new_user.clicked.connect(self._new_user)
        header.add_action(refresh)
        header.add_action(new_user)
        layout.addWidget(header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        filters = QHBoxLayout()
        filters.setSpacing(8)
        self.search_input = QLineEdit()
        self.search_input.setPlaceholderText("Search username or email...")
        self.search_input.setClearButtonEnabled(True)
        self.search_input.returnPressed.connect(self.refresh)
        self.search_input.textChanged.connect(self._on_filter_changed)
        self.status_combo = QComboBox()
        self.status_combo.addItem("Any status", None)
        for status in USER_STATUSES:
            self.status_combo.addItem(status.replace("_", " ").title(), status)
        self.status_combo.currentIndexChanged.connect(self.refresh)
        filters.addWidget(self.search_input, 1)
        filters.addWidget(self.status_combo)
        layout.addLayout(filters)

        self.table = DataTable(
            [
                ("username", "Username", 140),
                ("email", "Email", 190),
                ("phone", "Phone", 120),
                ("status", "Status", 90),
                ("roles_text", "Roles", 190),
                ("lastLogin_text", "Last login", 130),
                ("created_text", "Created", 130),
            ]
        )
        self.table.itemSelectionChanged.connect(self._update_actions)
        self.table.itemDoubleClicked.connect(lambda _item: self._edit_user())
        layout.addWidget(self.table, 1)

        actions = QHBoxLayout()
        actions.setSpacing(8)
        actions.addStretch(1)
        self.edit_button = ghost_button("Edit")
        self.edit_button.clicked.connect(self._edit_user)
        self.roles_button = ghost_button("Roles")
        self.roles_button.clicked.connect(self._assign_roles)
        self.lock_button = ghost_button("Lock")
        self.lock_button.clicked.connect(self._toggle_lock)
        self.reset_button = ghost_button("Reset password")
        self.reset_button.clicked.connect(self._reset_password)
        for button in (
            self.edit_button,
            self.roles_button,
            self.lock_button,
            self.reset_button,
        ):
            actions.addWidget(button)
        layout.addLayout(actions)

        self._update_actions()

    # ------------------------------------------------------------------ data
    def refresh(self) -> None:
        self.banner.clear()
        query = self.search_input.text().strip() or None
        status = self.status_combo.currentData()
        run_async(
            lambda: self._load(query, status),
            self._apply,
            self._on_error,
        )

    def _load(self, query: str | None, status: str | None) -> dict[str, Any]:
        users = self.session.identity.list_users(query=query, status=status, limit=200)
        roles = self.session.identity.list_roles()
        return {"users": users or [], "roles": roles or []}

    def _apply(self, data: dict[str, Any]) -> None:
        self._roles = data["roles"]
        rows = []
        for user in data["users"]:
            role_codes = [
                (assignment.get("role") or {}).get("code", "")
                for assignment in (user.get("roles") or [])
            ]
            rows.append(
                {
                    **user,
                    "roles_text": ", ".join(code for code in role_codes if code) or "-",
                    "lastLogin_text": format_datetime(user.get("lastLoginAt")),
                    "created_text": format_datetime(user.get("createdAt")),
                }
            )
        self.table.set_rows(rows)
        self._update_actions()

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))

    def _on_filter_changed(self, text: str) -> None:
        if not text:
            self.refresh()

    # --------------------------------------------------------------- actions
    def _selected(self) -> dict[str, Any] | None:
        return self.table.selected_row()

    def _update_actions(self) -> None:
        user = self._selected()
        enabled = user is not None
        for button in (
            self.edit_button,
            self.roles_button,
            self.lock_button,
            self.reset_button,
        ):
            button.setEnabled(enabled)
        if user is not None:
            is_locked = str(user.get("status")) == "LOCKED"
            self.lock_button.setText("Unlock" if is_locked else "Lock")

    def _new_user(self) -> None:
        dialog = CreateUserDialog(self._roles, self)
        if dialog.exec():
            payload = dialog.payload
            run_async(
                lambda: self.session.identity.create_user(payload),
                self._after_change("User created."),
                self._on_error,
            )

    def _edit_user(self) -> None:
        user = self._selected()
        if not user:
            return
        dialog = EditUserDialog(user, self)
        if dialog.exec():
            payload = dialog.payload
            run_async(
                lambda: self.session.identity.update_user(user["id"], payload),
                self._after_change("User updated."),
                self._on_error,
            )

    def _assign_roles(self) -> None:
        user = self._selected()
        if not user:
            return
        dialog = AssignRolesDialog(user, self._roles, self)
        if dialog.exec():
            payload = dialog.payload
            run_async(
                lambda: self.session.identity.assign_user_roles(
                    user["id"], payload["roleIds"]
                ),
                self._after_change("Roles updated."),
                self._on_error,
            )

    def _toggle_lock(self) -> None:
        user = self._selected()
        if not user:
            return

        if str(user.get("status")) == "LOCKED":
            if not confirm(self, "Unlock user", f"Unlock {user.get('username')}?"):
                return
            run_async(
                lambda: self.session.identity.unlock_user(user["id"]),
                self._after_change("User unlocked."),
                self._on_error,
            )
            return

        minutes, ok = QInputDialog.getInt(
            self,
            "Lock user",
            "Lock duration (minutes):",
            60,
            1,
            525600,
            30,
        )
        if not ok:
            return
        run_async(
            lambda: self.session.identity.lock_user(user["id"], minutes),
            self._after_change("User locked."),
            self._on_error,
        )

    def _reset_password(self) -> None:
        user = self._selected()
        if not user:
            return
        if not confirm(
            self,
            "Reset password",
            f"Reset the password for {user.get('username')}?\n\n"
            "All active sessions will be revoked and the user must change the "
            "password on next sign-in.",
        ):
            return
        run_async(
            lambda: self.session.identity.reset_password(user["id"]),
            self._show_reset_password,
            self._on_error,
        )

    def _after_change(self, message: str):
        def handler(_result: Any) -> None:
            self.banner.show_success(message)
            self.refresh()

        return handler

    def _show_reset_password(self, result: dict[str, Any]) -> None:
        temporary = (result or {}).get("temporaryPassword", "")
        box = QMessageBox(self)
        box.setIcon(QMessageBox.Icon.Information)
        box.setWindowTitle("Password reset")
        box.setText("A temporary password has been generated:")
        box.setInformativeText(temporary)
        box.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
        box.exec()
        self.banner.show_success(
            "Password reset. Share the temporary password securely."
        )
        self.refresh()
