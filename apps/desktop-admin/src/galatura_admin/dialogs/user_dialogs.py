"""User management dialogs."""

from __future__ import annotations

from collections.abc import Iterable
from typing import Any

from galatura_desktop_core.widgets import FormDialog
from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QComboBox,
    QLabel,
    QLineEdit,
    QListWidget,
    QListWidgetItem,
    QVBoxLayout,
    QWidget,
)

USER_STATUSES = ["ACTIVE", "LOCKED", "DISABLED", "PENDING"]


class CreateUserDialog(FormDialog):
    def __init__(
        self,
        roles: Iterable[dict[str, Any]],
        parent: QWidget | None = None,
    ):
        super().__init__("Create user", parent)
        self.roles = list(roles)

        self.username_input = QLineEdit()
        self.username_input.setPlaceholderText("Required, unique")
        self.email_input = QLineEdit()
        self.email_input.setPlaceholderText("Optional")
        self.phone_input = QLineEdit()
        self.phone_input.setPlaceholderText("Optional, e.g. 07XXXXXXXX")
        self.person_input = QLineEdit()
        self.person_input.setPlaceholderText("Optional person UUID to link")
        self.password_input = QLineEdit()
        self.password_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.password_input.setPlaceholderText("Leave blank to use the default")

        self.add_row("Username *", self.username_input)
        self.add_row("Email", self.email_input)
        self.add_row("Phone", self.phone_input)
        self.add_row("Person ID", self.person_input)
        self.add_row("Initial password", self.password_input)

        hint = QWidget()
        hint_layout = QVBoxLayout(hint)
        hint_layout.setContentsMargins(0, 0, 0, 0)

        policy = QLabel(
            "Passwords need 10+ characters with upper, lower, number and symbol."
        )
        policy.setObjectName("Muted")
        policy.setWordWrap(True)
        hint_layout.addWidget(policy)
        self.add_row("", hint)

        self.roles_list = QListWidget()
        self.roles_list.setMinimumHeight(140)
        for role in self.roles:
            item = QListWidgetItem(f"{role.get('code', '?')} - {role.get('name', '')}")
            item.setData(Qt.ItemDataRole.UserRole, role.get("id"))
            item.setFlags(item.flags() | Qt.ItemFlag.ItemIsUserCheckable)
            item.setCheckState(Qt.CheckState.Unchecked)
            self.roles_list.addItem(item)
        self.add_row("Roles", self.roles_list)

    def validate(self) -> str | None:
        if not self.username_input.text().strip():
            return "Username is required."
        return None

    def collect(self) -> dict[str, Any]:
        payload: dict[str, Any] = {"username": self.username_input.text().strip()}
        for key, widget in (
            ("email", self.email_input),
            ("phone", self.phone_input),
            ("personId", self.person_input),
            ("password", self.password_input),
        ):
            value = widget.text().strip()
            if value:
                payload[key] = value

        role_ids = []
        for index in range(self.roles_list.count()):
            item = self.roles_list.item(index)
            if item.checkState() == Qt.CheckState.Checked:
                role_ids.append(item.data(Qt.ItemDataRole.UserRole))
        if role_ids:
            payload["roleIds"] = role_ids
        return payload


class EditUserDialog(FormDialog):
    def __init__(self, user: dict[str, Any], parent: QWidget | None = None):
        super().__init__(f"Edit {user.get('username', 'user')}", parent)
        self.user = user

        self.email_input = QLineEdit(str(user.get("email") or ""))
        self.phone_input = QLineEdit(str(user.get("phone") or ""))
        self.status_combo = QComboBox()
        self.status_combo.addItems(USER_STATUSES)
        current_status = str(user.get("status") or "ACTIVE")
        if current_status in USER_STATUSES:
            self.status_combo.setCurrentText(current_status)

        self.add_row("Email", self.email_input)
        self.add_row("Phone", self.phone_input)
        self.add_row("Status", self.status_combo)

    def collect(self) -> dict[str, Any]:
        return {
            "email": self.email_input.text().strip() or None,
            "phone": self.phone_input.text().strip() or None,
            "status": self.status_combo.currentText(),
        }


class AssignRolesDialog(FormDialog):
    def __init__(
        self,
        user: dict[str, Any],
        roles: Iterable[dict[str, Any]],
        parent: QWidget | None = None,
    ):
        super().__init__(f"Roles for {user.get('username', 'user')}", parent)
        self.user = user
        current_ids = {
            (assignment.get("role") or {}).get("id")
            for assignment in (user.get("roles") or [])
        }

        self.roles_list = QListWidget()
        self.roles_list.setMinimumHeight(220)
        for role in roles:
            item = QListWidgetItem(f"{role.get('code', '?')} - {role.get('name', '')}")
            item.setData(Qt.ItemDataRole.UserRole, role.get("id"))
            item.setFlags(item.flags() | Qt.ItemFlag.ItemIsUserCheckable)
            item.setCheckState(
                Qt.CheckState.Checked
                if role.get("id") in current_ids
                else Qt.CheckState.Unchecked
            )
            self.roles_list.addItem(item)
        self.add_row("Roles", self.roles_list)

    def selected_role_ids(self) -> list[str]:
        role_ids = []
        for index in range(self.roles_list.count()):
            item = self.roles_list.item(index)
            if item.checkState() == Qt.CheckState.Checked:
                role_ids.append(item.data(Qt.ItemDataRole.UserRole))
        return role_ids

    def collect(self) -> dict[str, Any]:
        return {"roleIds": self.selected_role_ids()}


class ChangePasswordDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None):
        super().__init__("Change password", parent)
        self.old_input = QLineEdit()
        self.old_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.new_input = QLineEdit()
        self.new_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.confirm_input = QLineEdit()
        self.confirm_input.setEchoMode(QLineEdit.EchoMode.Password)

        self.add_row("Current password", self.old_input)
        self.add_row("New password", self.new_input)
        self.add_row("Confirm password", self.confirm_input)

    def validate(self) -> str | None:
        if not self.old_input.text():
            return "Enter your current password."
        if len(self.new_input.text()) < 10:
            return "The new password must be at least 10 characters."
        if self.new_input.text() != self.confirm_input.text():
            return "The new passwords do not match."
        return None

    def collect(self) -> dict[str, Any]:
        return {
            "oldPassword": self.old_input.text(),
            "newPassword": self.new_input.text(),
        }
