"""Sign-in window with a two-factor challenge step."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import SessionManager, human_error
from galatura_desktop_core.i18n import Translator
from galatura_desktop_core.widgets import StatusBanner, primary_button, run_async
from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QCheckBox,
    QDialog,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QPushButton,
    QVBoxLayout,
    QWidget,
)


class TwoFactorDialog(QDialog):
    def __init__(
        self,
        session: SessionManager,
        challenge_token: str,
        setup_required: bool,
        parent: QWidget | None = None,
    ):
        super().__init__(parent)
        self.session = session
        self.challenge_token = challenge_token
        self.setWindowTitle("Two-factor authentication")
        self.setModal(True)
        self.setMinimumWidth(420)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 24, 24, 24)
        layout.setSpacing(12)

        title = QLabel("Verify it's you")
        title.setObjectName("Title")
        layout.addWidget(title)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        if setup_required:
            hint = QLabel(
                "This account requires two-factor authentication, but no "
                "authenticator has been enrolled yet. Ask an administrator to "
                "reset 2FA for this account before signing in."
            )
            hint.setWordWrap(True)
            hint.setObjectName("Subtitle")
            layout.addWidget(hint)

            close = QPushButton("Close")
            close.clicked.connect(self.reject)
            layout.addWidget(close)
            return

        hint = QLabel("Enter the 6-digit code from your authenticator app.")
        hint.setObjectName("Subtitle")
        layout.addWidget(hint)

        self.code_input = QLineEdit()
        self.code_input.setPlaceholderText("000000")
        self.code_input.setMaxLength(6)
        self.code_input.setAlignment(Qt.AlignmentFlag.AlignCenter)
        self.code_input.setStyleSheet("font-size: 18pt; letter-spacing: 6px;")
        self.code_input.returnPressed.connect(self._verify)
        layout.addWidget(self.code_input)

        buttons = QHBoxLayout()
        cancel = QPushButton("Cancel")
        cancel.clicked.connect(self.reject)
        self.verify_button = primary_button("Verify")
        self.verify_button.clicked.connect(self._verify)
        buttons.addStretch(1)
        buttons.addWidget(cancel)
        buttons.addWidget(self.verify_button)
        layout.addLayout(buttons)

    def _verify(self) -> None:
        code = self.code_input.text().strip()
        if len(code) < 6:
            self.banner.show_error("Enter the 6-digit code from your authenticator.")
            return

        self.banner.clear()
        self.verify_button.setEnabled(False)
        self.code_input.setEnabled(False)

        run_async(
            lambda: self.session.complete_2fa(self.challenge_token, code),
            on_success=self._on_verified,
            on_error=self._on_error,
        )

    def _on_verified(self, _result: Any) -> None:
        self.accept()

    def _on_error(self, error: BaseException) -> None:
        self.verify_button.setEnabled(True)
        self.code_input.setEnabled(True)
        self.code_input.selectAll()
        self.banner.show_error(human_error(error))


class LoginWindow(QWidget):
    def __init__(self, session: SessionManager, translator: Translator | None = None):
        super().__init__()
        self.session = session
        self.translator = translator or Translator(parent=self)
        title = self.translator.tr("app.inventory")
        action = self.translator.tr("signin.title")
        self.setWindowTitle(f"{title} - {action}")
        self.resize(460, 560)
        self.setMinimumSize(420, 520)

        outer = QVBoxLayout(self)
        outer.setContentsMargins(40, 40, 40, 40)
        outer.addStretch(1)

        card = QFrame()
        card.setObjectName("Card")
        card.setMaximumWidth(440)
        layout = QVBoxLayout(card)
        layout.setContentsMargins(32, 32, 32, 32)
        layout.setSpacing(14)

        brand = QLabel("GALATURA")
        brand.setStyleSheet(
            "font-size: 11pt; font-weight: 800; letter-spacing: 3px; color: #37b57f;"
        )
        layout.addWidget(brand)

        title = QLabel(self.translator.tr("product.inventory"))
        title.setObjectName("Title")
        layout.addWidget(title)

        subtitle = QLabel(self.translator.tr("signin.subtitle.inventory"))
        subtitle.setObjectName("Subtitle")
        subtitle.setWordWrap(True)
        layout.addWidget(subtitle)

        layout.addSpacing(8)
        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        username_label = QLabel(self.translator.tr("signin.username"))
        self.username_input = QLineEdit()
        self.username_input.setPlaceholderText("e.g. storekeeper")
        self.username_input.returnPressed.connect(self._focus_password)
        layout.addWidget(username_label)
        layout.addWidget(self.username_input)

        password_label = QLabel(self.translator.tr("signin.password"))
        self.password_input = QLineEdit()
        self.password_input.setEchoMode(QLineEdit.EchoMode.Password)
        self.password_input.setPlaceholderText("Your password")
        self.password_input.returnPressed.connect(self._sign_in)
        layout.addWidget(password_label)
        layout.addWidget(self.password_input)

        show_password = QCheckBox(self.translator.tr("signin.show_password"))
        show_password.toggled.connect(self._toggle_password)
        layout.addWidget(show_password)

        self.sign_in_button = primary_button(self.translator.tr("signin.title"))
        self.sign_in_button.clicked.connect(self._sign_in)
        layout.addWidget(self.sign_in_button)

        layout.addSpacing(8)
        gateway = QLabel(
            f"Gateway: {session.config.gateway_url}\nClient app: {session.config.client_app}"
        )
        gateway.setObjectName("Muted")
        gateway.setWordWrap(True)
        layout.addWidget(gateway)

        footer = QLabel(self.translator.tr("signin.footer.inventory"))
        footer.setObjectName("Muted")
        footer.setWordWrap(True)
        layout.addWidget(footer)

        outer.addWidget(card, alignment=Qt.AlignmentFlag.AlignHCenter)
        outer.addStretch(1)

    def _focus_password(self) -> None:
        self.password_input.setFocus()

    def _toggle_password(self, checked: bool) -> None:
        self.password_input.setEchoMode(
            QLineEdit.EchoMode.Normal if checked else QLineEdit.EchoMode.Password
        )

    def reset(self) -> None:
        self.banner.clear()
        self.password_input.clear()
        self.sign_in_button.setEnabled(True)
        self.username_input.setFocus()

    def _sign_in(self) -> None:
        username = self.username_input.text().strip()
        password = self.password_input.text()
        if not username or not password:
            self.banner.show_error("Enter both your username and password.")
            return

        self.banner.clear()
        self.sign_in_button.setEnabled(False)

        run_async(
            lambda: self.session.login(username, password),
            on_success=self._on_login_result,
            on_error=self._on_login_error,
        )

    def _on_login_result(self, result: dict[str, Any]) -> None:
        self.sign_in_button.setEnabled(True)
        if not result.get("requires2fa"):
            return

        challenge = result.get("challengeToken") or ""
        requires_setup = SessionManager.challenge_requires_setup(challenge)
        dialog = TwoFactorDialog(self.session, challenge, requires_setup, parent=self)
        dialog.exec()

    def _on_login_error(self, error: BaseException) -> None:
        self.sign_in_button.setEnabled(True)
        self.password_input.selectAll()
        self.banner.show_error(human_error(error))
