"""Current-user account dialog: change password and enrol 2FA."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import SessionManager, human_error
from galatura_desktop_core.widgets import (
    StatusBanner,
    ghost_button,
    primary_button,
    run_async,
    show_info,
)
from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QDialog,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QVBoxLayout,
    QWidget,
)


class AccountDialog(QDialog):
    def __init__(self, session: SessionManager, parent: QWidget | None = None):
        super().__init__(parent)
        self.session = session
        self.password_changed = False
        self.setWindowTitle("My account")
        self.setMinimumWidth(560)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 24, 24, 24)
        layout.setSpacing(14)

        title = QLabel("My account")
        title.setObjectName("Title")
        layout.addWidget(title)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        profile_form = QFormLayout()
        profile_form.setHorizontalSpacing(20)
        profile_form.setVerticalSpacing(8)
        profile = session.profile
        roles = ", ".join(session.roles) if session.roles else "-"
        for label, value in (
            ("Username", profile.get("username")),
            ("Email", profile.get("email")),
            ("Phone", profile.get("phone")),
            ("Status", profile.get("status")),
            ("Roles", roles),
            ("2FA", "Enabled" if profile.get("totpEnabled") else "Not enabled"),
        ):
            field = QLabel("" if value is None else str(value))
            field.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
            profile_form.addRow(label, field)
        layout.addLayout(profile_form)

        layout.addWidget(QLabel("Change password"))
        password_form = QFormLayout()
        password_form.setHorizontalSpacing(20)
        password_form.setVerticalSpacing(8)
        self.old_password = QLineEdit()
        self.old_password.setEchoMode(QLineEdit.EchoMode.Password)
        self.new_password = QLineEdit()
        self.new_password.setEchoMode(QLineEdit.EchoMode.Password)
        self.confirm_password = QLineEdit()
        self.confirm_password.setEchoMode(QLineEdit.EchoMode.Password)
        password_form.addRow("Current password", self.old_password)
        password_form.addRow("New password", self.new_password)
        password_form.addRow("Confirm password", self.confirm_password)
        layout.addLayout(password_form)

        password_actions = QHBoxLayout()
        password_actions.addStretch(1)
        self.change_password_button = primary_button("Change password")
        self.change_password_button.clicked.connect(self._change_password)
        password_actions.addWidget(self.change_password_button)
        layout.addLayout(password_actions)

        layout.addWidget(QLabel("Two-factor authentication"))
        self.twofa_status = QLabel(
            "Two-factor authentication is enabled."
            if profile.get("totpEnabled")
            else "Two-factor authentication is not enabled for this account."
        )
        self.twofa_status.setObjectName("Subtitle")
        self.twofa_status.setWordWrap(True)
        layout.addWidget(self.twofa_status)

        self.setup_button = ghost_button("Set up authenticator")
        self.setup_button.clicked.connect(self._setup_2fa)
        layout.addWidget(self.setup_button)

        self.secret_input = QLineEdit()
        self.secret_input.setReadOnly(True)
        self.secret_input.setVisible(False)
        self.otp_url_input = QLineEdit()
        self.otp_url_input.setReadOnly(True)
        self.otp_url_input.setVisible(False)
        layout.addWidget(QLabel("Secret"))
        layout.addWidget(self.secret_input)
        layout.addWidget(QLabel("otpauth URL"))
        layout.addWidget(self.otp_url_input)

        enable_row = QHBoxLayout()
        self.code_input = QLineEdit()
        self.code_input.setPlaceholderText("6-digit code from the authenticator")
        self.code_input.setVisible(False)
        self.enable_button = primary_button("Enable 2FA")
        self.enable_button.clicked.connect(self._enable_2fa)
        self.enable_button.setVisible(False)
        enable_row.addWidget(self.code_input, 1)
        enable_row.addWidget(self.enable_button)
        layout.addLayout(enable_row)

        close_row = QHBoxLayout()
        close_row.addStretch(1)
        close = ghost_button("Close")
        close.clicked.connect(self.accept)
        close_row.addWidget(close)
        layout.addLayout(close_row)

    # -------------------------------------------------------------- password
    def _change_password(self) -> None:
        if not self.old_password.text():
            self.banner.show_error("Enter your current password.")
            return
        if len(self.new_password.text()) < 10:
            self.banner.show_error("The new password must be at least 10 characters.")
            return
        if self.new_password.text() != self.confirm_password.text():
            self.banner.show_error("The new passwords do not match.")
            return

        old_value = self.old_password.text()
        new_value = self.new_password.text()
        self.change_password_button.setEnabled(False)
        run_async(
            lambda: self.session.identity.change_password(old_value, new_value),
            self._password_changed,
            self._password_error,
        )

    def _password_changed(self, _result: Any) -> None:
        self.change_password_button.setEnabled(True)
        self.password_changed = True
        self.session.profile["mustChangePassword"] = False
        show_info(
            self,
            "Password changed",
            "Your password has been changed and all sessions were revoked. "
            "Please sign in again.",
        )
        self.accept()

    def _password_error(self, error: BaseException) -> None:
        self.change_password_button.setEnabled(True)
        self.banner.show_error(human_error(error))

    # ------------------------------------------------------------------- 2FA
    def _setup_2fa(self) -> None:
        self.setup_button.setEnabled(False)
        run_async(self.session.identity.setup_2fa, self._show_setup, self._setup_error)

    def _show_setup(self, result: dict[str, Any]) -> None:
        self.setup_button.setEnabled(True)
        self.secret_input.setText(result.get("secret") or "")
        self.otp_url_input.setText(result.get("otpAuthUrl") or "")
        self.secret_input.setVisible(True)
        self.otp_url_input.setVisible(True)
        self.code_input.setVisible(True)
        self.enable_button.setVisible(True)
        self.banner.show_info(
            "Add the secret to your authenticator app, then enter a code to enable 2FA."
        )

    def _setup_error(self, error: BaseException) -> None:
        self.setup_button.setEnabled(True)
        self.banner.show_error(human_error(error))

    def _enable_2fa(self) -> None:
        code = self.code_input.text().strip()
        if len(code) < 6:
            self.banner.show_error("Enter the 6-digit code from your authenticator.")
            return
        self.enable_button.setEnabled(False)
        run_async(
            lambda: self.session.identity.enable_2fa(code),
            self._enabled,
            self._enable_error,
        )

    def _enabled(self, _result: Any) -> None:
        self.enable_button.setEnabled(True)
        self.session.profile["totpEnabled"] = True
        self.twofa_status.setText("Two-factor authentication is enabled.")
        self.secret_input.setVisible(False)
        self.otp_url_input.setVisible(False)
        self.code_input.setVisible(False)
        self.enable_button.setVisible(False)
        self.banner.show_success("Two-factor authentication enabled.")

    def _enable_error(self, error: BaseException) -> None:
        self.enable_button.setEnabled(True)
        self.banner.show_error(human_error(error))
