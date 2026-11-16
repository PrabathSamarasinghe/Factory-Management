"""Roles and permission management with maker-checker approvals."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    FormDialog,
    PageHeader,
    StatusBanner,
    confirm,
    danger_button,
    format_datetime,
    ghost_button,
    primary_button,
    run_async,
    show_info,
)
from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QFormLayout,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QScrollArea,
    QSplitter,
    QTabWidget,
    QTextEdit,
    QVBoxLayout,
    QWidget,
)

SCOPES = ["ALL", "DEPARTMENT", "ROUTE", "OWN"]


class CreateRoleDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None):
        super().__init__("Create role", parent)
        self.code_input = QLineEdit()
        self.code_input.setPlaceholderText("e.g. STORE_MANAGER")
        self.name_input = QLineEdit()
        self.description_input = QTextEdit()
        self.description_input.setFixedHeight(70)
        self.requires_2fa = QCheckBox("Sign-in requires two-factor authentication")

        self.add_row("Code *", self.code_input)
        self.add_row("Name *", self.name_input)
        self.add_row("Description", self.description_input)
        self.add_row("", self.requires_2fa)

    def validate(self) -> str | None:
        if not self.code_input.text().strip():
            return "Role code is required."
        if not self.name_input.text().strip():
            return "Role name is required."
        return None

    def collect(self) -> dict[str, Any]:
        return {
            "code": self.code_input.text().strip().upper(),
            "name": self.name_input.text().strip(),
            "description": self.description_input.toPlainText().strip() or None,
            "requires2fa": self.requires_2fa.isChecked(),
        }


class RoleDetailPanel(QFrame):
    def __init__(self, session: SessionManager, parent: QWidget | None = None):
        super().__init__(parent)
        self.session = session
        self.role: dict[str, Any] | None = None
        self.permission_catalog: list[dict[str, Any]] = []
        self._permission_rows: list[tuple[dict[str, Any], QCheckBox, QComboBox]] = []
        self.setObjectName("Panel")

        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 16, 18, 16)
        layout.setSpacing(10)

        self.title = QLabel("Select a role")
        self.title.setObjectName("PageTitle")
        self.title.setStyleSheet("font-size: 12pt;")
        layout.addWidget(self.title)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        self.form = QFormLayout()
        self.form.setHorizontalSpacing(12)
        self.form.setVerticalSpacing(8)
        self.name_input = QLineEdit()
        self.description_input = QTextEdit()
        self.description_input.setFixedHeight(64)
        self.requires_2fa = QCheckBox("Requires two-factor authentication")
        self.form.addRow("Name", self.name_input)
        self.form.addRow("Description", self.description_input)
        self.form.addRow("", self.requires_2fa)
        layout.addLayout(self.form)

        meta_actions = QHBoxLayout()
        self.save_meta = ghost_button("Save details")
        self.save_meta.clicked.connect(self._save_metadata)
        meta_actions.addWidget(self.save_meta)
        meta_actions.addStretch(1)
        layout.addLayout(meta_actions)

        layout.addWidget(QLabel("Permissions"))
        hint = QLabel(
            "Changes are submitted for approval by a different administrator "
            "(maker-checker)."
        )
        hint.setObjectName("Muted")
        hint.setWordWrap(True)
        layout.addWidget(hint)

        self.perm_scroll = QScrollArea()
        self.perm_scroll.setWidgetResizable(True)
        self.perm_scroll.setFrameShape(QFrame.Shape.NoFrame)
        layout.addWidget(self.perm_scroll, 1)

        submit_row = QHBoxLayout()
        submit_row.addStretch(1)
        self.submit_button = primary_button("Submit permission changes")
        self.submit_button.clicked.connect(self._submit_permissions)
        submit_row.addWidget(self.submit_button)
        layout.addLayout(submit_row)

        self._set_enabled(False)

    def _set_enabled(self, enabled: bool) -> None:
        for widget in (
            self.name_input,
            self.description_input,
            self.requires_2fa,
            self.save_meta,
        ):
            widget.setEnabled(enabled)
        self.submit_button.setEnabled(enabled)

    def set_data(
        self,
        role: dict[str, Any] | None,
        permission_catalog: list[dict[str, Any]],
    ) -> None:
        self.role = role
        self.permission_catalog = permission_catalog
        self.banner.clear()

        if not role:
            self.title.setText("Select a role")
            self._set_enabled(False)
            self._render_permissions()
            return

        self.title.setText(f"{role.get('code', '')} - {role.get('name', '')}")
        self.name_input.setText(str(role.get("name") or ""))
        self.description_input.setPlainText(str(role.get("description") or ""))
        self.requires_2fa.setChecked(bool(role.get("requires2fa")))
        self._set_enabled(True)
        self._render_permissions()

    def _render_permissions(self) -> None:
        container = QWidget()
        layout = QVBoxLayout(container)
        layout.setContentsMargins(4, 4, 4, 4)
        layout.setSpacing(6)
        self._permission_rows = []

        assigned: dict[str, str] = {}
        if self.role:
            for assignment in self.role.get("permissions") or []:
                permission = assignment.get("permission") or {}
                permission_id = assignment.get("permissionId") or permission.get("id")
                if permission_id:
                    assigned[permission_id] = assignment.get("scope") or "ALL"

        for permission in self.permission_catalog:
            permission_id = permission.get("id")
            row = QFrame()
            row_layout = QHBoxLayout(row)
            row_layout.setContentsMargins(4, 2, 4, 2)

            checkbox = QCheckBox(
                f"{permission.get('code', '')}"
                + (
                    f" - {permission.get('description')}"
                    if permission.get("description")
                    else ""
                )
            )
            checkbox.setChecked(permission_id in assigned)
            if not self.role:
                checkbox.setEnabled(False)

            scope = QComboBox()
            scope.addItems(SCOPES)
            if permission_id in assigned:
                scope.setCurrentText(assigned[permission_id])
            scope.setEnabled(checkbox.isChecked() and bool(self.role))
            checkbox.toggled.connect(scope.setEnabled)

            row_layout.addWidget(checkbox, 1)
            row_layout.addWidget(scope)
            layout.addWidget(row)
            self._permission_rows.append((permission, checkbox, scope))

        layout.addStretch(1)
        self.perm_scroll.setWidget(container)

    def _save_metadata(self) -> None:
        if not self.role:
            return
        payload = {
            "name": self.name_input.text().strip(),
            "description": self.description_input.toPlainText().strip() or None,
            "requires2fa": self.requires_2fa.isChecked(),
        }
        if not payload["name"]:
            self.banner.show_error("Role name is required.")
            return
        role_id = self.role["id"]
        run_async(
            lambda: self.session.identity.update_role(role_id, payload),
            self._on_saved,
            self._on_error,
        )

    def _submit_permissions(self) -> None:
        if not self.role:
            return
        assignments = []
        for permission, checkbox, scope in self._permission_rows:
            if checkbox.isChecked():
                assignments.append(
                    {
                        "permissionId": permission.get("id"),
                        "scope": scope.currentText(),
                    }
                )
        role_id = self.role["id"]
        run_async(
            lambda: self.session.identity.request_role_permissions(
                role_id, assignments
            ),
            self._on_submitted,
            self._on_error,
        )

    def _on_saved(self, _result: Any) -> None:
        self.banner.show_success("Role details updated.")

    def _on_submitted(self, _result: Any) -> None:
        self.banner.show_success(
            "Permission change submitted. A different administrator must approve it."
        )

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))


class RolesPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session
        self._roles: list[dict[str, Any]] = []
        self._permissions: list[dict[str, Any]] = []
        self._permission_by_id: dict[str, str] = {}
        self._requests: list[dict[str, Any]] = []
        self._selected_role_id: str | None = None

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(14)

        header = PageHeader(
            "Roles & Permissions",
            "Permission changes use maker-checker approval.",
        )
        refresh = ghost_button("Refresh")
        refresh.clicked.connect(self.refresh)
        self.new_role = primary_button("New role")
        self.new_role.clicked.connect(self._create_role)
        self.delete_role = danger_button("Delete role")
        self.delete_role.setEnabled(False)
        self.delete_role.clicked.connect(self._delete_role)
        header.add_action(refresh)
        header.add_action(self.delete_role)
        header.add_action(self.new_role)
        layout.addWidget(header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        self.tabs = QTabWidget()
        self.tabs.currentChanged.connect(self._on_tab_changed)
        layout.addWidget(self.tabs, 1)

        # ------------------------------------------------------ permissions tab
        permissions_tab = QWidget()
        permissions_layout = QVBoxLayout(permissions_tab)
        permissions_layout.setContentsMargins(10, 10, 10, 10)

        splitter = QSplitter(Qt.Orientation.Horizontal)
        self.roles_table = DataTable(
            [
                ("code", "Code", 150),
                ("name", "Name", 190),
                ("requires2fa", "2FA", 60),
                ("permission_count", "Permissions", 90),
            ]
        )
        self.roles_table.itemSelectionChanged.connect(self._on_role_selected)
        splitter.addWidget(self.roles_table)

        self.detail = RoleDetailPanel(session)
        splitter.addWidget(self.detail)
        splitter.setStretchFactor(0, 1)
        splitter.setStretchFactor(1, 2)
        splitter.setSizes([320, 640])
        permissions_layout.addWidget(splitter, 1)
        self.tabs.addTab(permissions_tab, "Roles")

        # --------------------------------------------------------- approvals tab
        approvals_tab = QWidget()
        approvals_layout = QVBoxLayout(approvals_tab)
        approvals_layout.setContentsMargins(10, 10, 10, 10)

        approval_filters = QHBoxLayout()
        self.request_status = QComboBox()
        self.request_status.addItem("Pending", "PENDING")
        self.request_status.addItem("Approved", "APPROVED")
        self.request_status.addItem("Rejected", "REJECTED")
        self.request_status.addItem("All", None)
        self.request_status.currentIndexChanged.connect(self.refresh_requests)
        approval_filters.addWidget(QLabel("Status"))
        approval_filters.addWidget(self.request_status)
        approval_filters.addStretch(1)
        self.approve_button = primary_button("Approve")
        self.approve_button.clicked.connect(self._approve_request)
        self.reject_button = danger_button("Reject")
        self.reject_button.clicked.connect(self._reject_request)
        self.view_button = ghost_button("View change")
        self.view_button.clicked.connect(self._view_request)
        for button in (self.view_button, self.approve_button, self.reject_button):
            approval_filters.addWidget(button)
        approvals_layout.addLayout(approval_filters)

        self.requests_table = DataTable(
            [
                ("createdAt_text", "Requested", 140),
                ("role_code", "Role", 140),
                ("requestedBy", "Requested by", 170),
                ("status", "Status", 90),
                ("change_count", "Assignments", 90),
                ("decidedAt_text", "Decided", 140),
            ]
        )
        self.requests_table.itemSelectionChanged.connect(self._update_request_actions)
        approvals_layout.addWidget(self.requests_table, 1)
        self.tabs.addTab(approvals_tab, "Approval queue")

        self._update_request_actions()

    # ------------------------------------------------------------------ data
    def refresh(self) -> None:
        self.banner.clear()
        status = self.request_status.currentData()
        run_async(lambda: self._load(status), self._apply, self._on_error)

    def _load(self, status: str | None) -> dict[str, Any]:
        roles = self.session.identity.list_roles() or []
        permissions = self.session.identity.list_permissions() or []
        requests = self.session.identity.list_permission_requests(status) or []
        return {
            "roles": roles,
            "permissions": permissions,
            "requests": requests,
        }

    def _apply(self, data: dict[str, Any]) -> None:
        self._roles = data["roles"]
        self._permissions = data["permissions"]
        self._permission_by_id = {
            permission.get("id"): permission.get("code", "")
            for permission in self._permissions
        }

        rows = []
        for role in self._roles:
            rows.append(
                {
                    **role,
                    "requires2fa": "Yes" if role.get("requires2fa") else "No",
                    "permission_count": len(role.get("permissions") or []),
                }
            )
        self.roles_table.set_rows(rows)

        selected = None
        if self._selected_role_id:
            selected = next(
                (role for role in self._roles if role["id"] == self._selected_role_id),
                None,
            )
        if selected:
            self._select_role(selected)
        else:
            self.detail.set_data(None, self._permissions)

        self._requests = data["requests"]
        self._render_requests()
        self._update_request_actions()

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))

    # --------------------------------------------------------------- roles UI
    def _on_role_selected(self) -> None:
        role = self.roles_table.selected_row()
        if not role:
            self.detail.set_data(None, self._permissions)
            self.delete_role.setEnabled(False)
            return
        self._selected_role_id = role.get("id")
        self.detail.set_data(role, self._permissions)
        self.delete_role.setEnabled(True)

    def _select_role(self, role: dict[str, Any]) -> None:
        for index in range(self.roles_table.rowCount()):
            data = self.roles_table.row_data(index)
            if data and data.get("id") == role.get("id"):
                self.roles_table.selectRow(index)
                break

    def _create_role(self) -> None:
        dialog = CreateRoleDialog(self)
        if not dialog.exec():
            return
        payload = dialog.payload
        run_async(
            lambda: self.session.identity.create_role(payload),
            self._after_change("Role created."),
            self._on_error,
        )

    def _delete_role(self) -> None:
        role = self.roles_table.selected_row()
        if not role:
            return
        if not confirm(
            self,
            "Delete role",
            f"Delete role {role.get('code')}? This cannot be undone.",
        ):
            return
        role_id = role["id"]
        run_async(
            lambda: self.session.identity.delete_role(role_id),
            self._after_delete,
            self._on_error,
        )

    def _after_change(self, message: str):
        def handler(_result: Any) -> None:
            self.banner.show_success(message)
            self.refresh()

        return handler

    def _after_delete(self, _result: Any) -> None:
        self._selected_role_id = None
        self.banner.show_success("Role deleted.")
        self.refresh()

    # ---------------------------------------------------------- approvals UI
    def _on_tab_changed(self, index: int) -> None:
        if index == 1:
            self.refresh_requests()

    def refresh_requests(self) -> None:
        status = self.request_status.currentData()
        run_async(
            lambda: self.session.identity.list_permission_requests(status),
            self._apply_requests,
            self._on_error,
        )

    def _apply_requests(self, requests: list[dict[str, Any]]) -> None:
        self._requests = requests or []
        self._render_requests()
        self._update_request_actions()

    def _render_requests(self) -> None:
        rows = []
        for request in self._requests:
            role = request.get("role") or {}
            change = request.get("change") or []
            rows.append(
                {
                    **request,
                    "role_code": role.get("code") or role.get("name") or "-",
                    "createdAt_text": format_datetime(request.get("createdAt")),
                    "decidedAt_text": format_datetime(request.get("decidedAt")),
                    "change_count": len(change) if isinstance(change, list) else "-",
                }
            )
        self.requests_table.set_rows(rows)

    def _update_request_actions(self) -> None:
        request = self.requests_table.selected_row()
        can_decide = bool(
            request
            and str(request.get("status")) == "PENDING"
            and request.get("requestedBy") != self.session.profile.get("id")
        )
        self.approve_button.setEnabled(can_decide)
        self.reject_button.setEnabled(can_decide)
        self.view_button.setEnabled(request is not None)

    def _approve_request(self) -> None:
        request = self.requests_table.selected_row()
        if not request:
            return
        request_id = request["id"]
        run_async(
            lambda: self.session.identity.approve_permission_request(request_id),
            self._after_request("Change request approved."),
            self._on_error,
        )

    def _reject_request(self) -> None:
        request = self.requests_table.selected_row()
        if not request:
            return
        request_id = request["id"]
        run_async(
            lambda: self.session.identity.reject_permission_request(request_id),
            self._after_request("Change request rejected."),
            self._on_error,
        )

    def _after_request(self, message: str):
        def handler(_result: Any) -> None:
            self.banner.show_success(message)
            self.refresh()
            self.refresh_requests()

        return handler

    def _view_request(self) -> None:
        request = self.requests_table.selected_row()
        if not request:
            return
        change = request.get("change") or []
        lines = []
        for assignment in change:
            permission_id = assignment.get("permissionId")
            code = self._permission_by_id.get(permission_id, permission_id or "?")
            lines.append(f"- {code} (scope: {assignment.get('scope', 'ALL')})")
        text = "\n".join(lines) if lines else "No permission assignments."
        show_info(
            self,
            f"Change request - {request.get('status', '')}",
            text,
        )
