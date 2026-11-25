"""Main admin console window with sidebar navigation."""

from __future__ import annotations

from galatura_desktop_core import SessionManager
from galatura_desktop_core.i18n import LanguageComboBox, Translator
from galatura_desktop_core.idle_lock import IdleLock, sensitive_screen
from galatura_desktop_core.realtime_client import (
    DataChangedIndicator,
    RealtimeClient,
    channels_for_permissions,
)
from galatura_desktop_core.settings import DesktopSettings
from galatura_desktop_core.widgets import confirm, ghost_button
from PySide6.QtCore import Qt
from PySide6.QtWidgets import (
    QButtonGroup,
    QFrame,
    QHBoxLayout,
    QLabel,
    QMainWindow,
    QPushButton,
    QStackedWidget,
    QStatusBar,
    QVBoxLayout,
    QWidget,
)

from .dialogs.account_dialog import AccountDialog
from .pages.audit_page import AuditPage
from .pages.dashboard_page import DashboardPage
from .pages.fleet_assignments_page import AssignmentsPage
from .pages.fleet_lorries_page import LorriesPage
from .pages.fleet_routes_page import RoutesPage
from .pages.persons_page import PersonsPage
from .pages.roles_page import RolesPage
from .pages.users_page import UsersPage


class MainWindow(QMainWindow):
    def __init__(
        self,
        session: SessionManager,
        settings: DesktopSettings | None = None,
        translator: Translator | None = None,
    ):
        super().__init__()
        self.session = session
        self.settings = settings or DesktopSettings("admin")
        self.translator = translator or Translator(self.settings, self)
        self.setWindowTitle(self.translator.tr("app.admin"))
        self.resize(1320, 840)
        self.setMinimumSize(1080, 680)

        root = QWidget()
        self.setCentralWidget(root)
        root_layout = QHBoxLayout(root)
        root_layout.setContentsMargins(0, 0, 0, 0)
        root_layout.setSpacing(0)

        sidebar = QFrame()
        sidebar.setObjectName("Sidebar")
        sidebar.setFixedWidth(230)
        sidebar.setStyleSheet(
            "QFrame#Sidebar { background-color: #121c26; border-right: 1px solid #22313d; }"
        )
        sidebar_layout = QVBoxLayout(sidebar)
        sidebar_layout.setContentsMargins(16, 20, 16, 20)
        sidebar_layout.setSpacing(10)

        brand = QLabel("GALATURA")
        brand.setStyleSheet(
            "font-size: 10pt; font-weight: 800; letter-spacing: 2px; color: #37b57f;"
        )
        sidebar_layout.addWidget(brand)
        self.product_label = QLabel(self.translator.tr("product.admin"))
        self.product_label.setObjectName("Title")
        self.product_label.setStyleSheet("font-size: 14pt;")
        sidebar_layout.addWidget(self.product_label)
        sidebar_layout.addSpacing(14)

        self.nav_group = QButtonGroup(self)
        self.nav_group.setExclusive(True)
        self.nav_buttons: list[QPushButton] = []
        self._nav_keys = [
            "nav.dashboard",
            "nav.people",
            "nav.users",
            "nav.roles",
            "nav.lorries",
            "nav.routes",
            "nav.assignments",
            "nav.audit",
        ]
        for index, key in enumerate(self._nav_keys):
            button = QPushButton(self.translator.tr(key))
            button.setObjectName("Nav")
            button.setCheckable(True)
            button.setCursor(Qt.CursorShape.PointingHandCursor)
            button.clicked.connect(lambda _checked, i=index: self._switch(i))
            self.nav_group.addButton(button, index)
            self.nav_buttons.append(button)
            sidebar_layout.addWidget(button)

        sidebar_layout.addStretch(1)

        user_frame = QFrame()
        user_frame.setObjectName("Panel")
        user_layout = QVBoxLayout(user_frame)
        user_layout.setContentsMargins(12, 10, 12, 10)
        user_layout.setSpacing(2)
        self.user_label = QLabel(session.display_name)
        self.user_label.setStyleSheet("font-weight: 600;")
        self.roles_label = QLabel(", ".join(session.roles) or self.translator.tr("status.no_roles"))
        self.roles_label.setObjectName("Muted")
        self.roles_label.setWordWrap(True)
        user_layout.addWidget(self.user_label)
        user_layout.addWidget(self.roles_label)
        sidebar_layout.addWidget(user_frame)

        self.account_button = ghost_button(self.translator.tr("action.my_account"))
        self.account_button.clicked.connect(self._open_account)
        self.sign_out_button = ghost_button(self.translator.tr("action.sign_out"))
        self.sign_out_button.clicked.connect(self._sign_out)
        sidebar_layout.addWidget(self.account_button)
        sidebar_layout.addWidget(self.sign_out_button)

        root_layout.addWidget(sidebar)

        content = QWidget()
        content_layout = QVBoxLayout(content)
        content_layout.setContentsMargins(0, 0, 0, 0)
        content_layout.setSpacing(0)

        self.password_banner = QFrame()
        self.password_banner.setObjectName("BannerInfo")
        banner_layout = QHBoxLayout(self.password_banner)
        banner_layout.setContentsMargins(28, 8, 28, 8)
        self.warning_label = QLabel(self.translator.tr("password.warning"))
        self.warning_label.setObjectName("Muted")
        banner_layout.addWidget(self.warning_label, 1)
        self.change_now_button = ghost_button(self.translator.tr("action.change_now"))
        self.change_now_button.clicked.connect(self._open_account)
        banner_layout.addWidget(self.change_now_button)
        self.password_banner.setVisible(session.must_change_password)
        content_layout.addWidget(self.password_banner)

        self.stack = QStackedWidget()
        self.pages = [
            DashboardPage(session),
            PersonsPage(session),
            UsersPage(session),
            RolesPage(session),
            LorriesPage(session),
            RoutesPage(session),
            AssignmentsPage(session),
            AuditPage(session),
        ]
        for page in self.pages:
            self.stack.addWidget(page)
        content_layout.addWidget(self.stack, 1)

        root_layout.addWidget(content, 1)

        self.status_bar = QStatusBar()
        self.setStatusBar(self.status_bar)
        self.gateway_status = QLabel(
            f"Gateway: {session.config.gateway_url} | App: {session.config.client_app}"
        )
        self.gateway_status.setObjectName("Muted")
        self.status_bar.addWidget(self.gateway_status, 1)
        self.data_indicator = DataChangedIndicator(self.translator, self)
        self.data_indicator.refresh_requested.connect(self._refresh_current_page)
        self.status_bar.addPermanentWidget(self.data_indicator)
        self.language_selector = LanguageComboBox(self.translator, self)
        self.status_bar.addPermanentWidget(self.language_selector)
        self.status_bar.showMessage(self.translator.tr("status.ready"))

        channels = channels_for_permissions(
            self.session.permissions, ("admin.audit", "monitor.today")
        )
        self.realtime: RealtimeClient | None = None
        if self.settings.realtime_enabled and channels:
            self.realtime = RealtimeClient(self.session.client, channels, parent=self)
            self.realtime.connected.connect(self._on_realtime_connected)
            self.realtime.disconnected.connect(self._on_realtime_disconnected)
            self.realtime.data_changed.connect(self.data_indicator.mark_data_changed)
            self.realtime.error.connect(self._on_realtime_error)
            self.realtime.start()
        else:
            self.data_indicator.set_unavailable()

        self.idle_lock = IdleLock(self.settings, self)
        self.idle_lock.locked.connect(self._on_idle_locked)
        self.idle_lock.start()
        self.translator.language_changed.connect(self._retranslate)

        self._switch(0)

    def _retranslate(self, *_args: object) -> None:
        self.setWindowTitle(self.translator.tr("app.admin"))
        self.product_label.setText(self.translator.tr("product.admin"))
        for button, key in zip(self.nav_buttons, self._nav_keys):
            button.setText(self.translator.tr(key))
        self.roles_label.setText(
            ", ".join(self.session.roles) or self.translator.tr("status.no_roles")
        )
        self.account_button.setText(self.translator.tr("action.my_account"))
        self.sign_out_button.setText(self.translator.tr("action.sign_out"))
        self.warning_label.setText(self.translator.tr("password.warning"))
        self.change_now_button.setText(self.translator.tr("action.change_now"))

    def _switch(self, index: int) -> None:
        self.stack.setCurrentIndex(index)
        if 0 <= index < len(self.nav_buttons):
            self.nav_buttons[index].setChecked(True)
        page = self.pages[index]
        refresh = getattr(page, "refresh", None)
        if callable(refresh):
            refresh()

    def _refresh_current_page(self) -> None:
        self._switch(self.stack.currentIndex())
        self.data_indicator.clear()

    def _on_realtime_connected(self) -> None:
        self.data_indicator.set_connected(True)

    def _on_realtime_disconnected(self) -> None:
        self.data_indicator.set_connected(False)

    def _on_realtime_error(self, message: str) -> None:
        self.data_indicator.set_unavailable()
        self.status_bar.showMessage(message, 5000)

    def _on_idle_locked(self, reason: str) -> None:
        key = "lock.sensitive" if reason == "sensitive" else "lock.idle"
        self.status_bar.showMessage(self.translator.tr(key))
        self.session.logout()

    def _open_account(self) -> None:
        with sensitive_screen():
            dialog = AccountDialog(self.session, self)
            dialog.exec()
        if dialog.password_changed:
            self.session.logout()

    def _sign_out(self) -> None:
        if confirm(self, "Sign out", self.translator.tr("action.sign_out") + "?"):
            self.session.logout()

    def closeEvent(self, event) -> None:
        if self.realtime is not None:
            self.realtime.stop()
        self.idle_lock.stop()
        event.accept()
