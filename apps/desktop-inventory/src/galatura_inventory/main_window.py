"""Main inventory window with sidebar navigation and connection status."""

from __future__ import annotations

from galatura_desktop_core import SessionManager
from galatura_desktop_core.i18n import LanguageComboBox, Translator
from galatura_desktop_core.idle_lock import IdleLock
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

from .pages.adjustments_page import AdjustmentsPage
from .pages.dashboard_page import DashboardPage
from .pages.items_page import ItemsPage
from .pages.issues_page import IssuesPage
from .pages.receipts_page import ReceiptsPage
from .pages.stock_page import StockPage
from .pages.stock_takes_page import StockTakesPage
from .pages.transfers_page import TransfersPage


class MainWindow(QMainWindow):
    def __init__(
        self,
        session: SessionManager,
        settings: DesktopSettings | None = None,
        translator: Translator | None = None,
    ):
        super().__init__()
        self.session = session
        self.settings = settings or DesktopSettings("inventory")
        self.translator = translator or Translator(self.settings, self)
        self.setWindowTitle(self.translator.tr("app.inventory"))
        self.resize(1400, 880)
        self.setMinimumSize(1120, 700)

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
        sidebar_layout.setSpacing(8)

        brand = QLabel("GALATURA")
        brand.setStyleSheet(
            "font-size: 10pt; font-weight: 800; letter-spacing: 2px; color: #37b57f;"
        )
        sidebar_layout.addWidget(brand)
        self.product_label = QLabel(self.translator.tr("product.inventory"))
        self.product_label.setObjectName("Title")
        self.product_label.setStyleSheet("font-size: 14pt;")
        sidebar_layout.addWidget(self.product_label)
        sidebar_layout.addSpacing(14)

        self.nav_group = QButtonGroup(self)
        self.nav_group.setExclusive(True)
        self.nav_buttons: list[QPushButton] = []
        self._nav_keys = [
            "nav.dashboard",
            "nav.items",
            "nav.receipts",
            "nav.issues",
            "nav.transfers",
            "nav.adjustments",
            "nav.stock_takes",
            "nav.stock",
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

        self.sign_out_button = ghost_button(self.translator.tr("action.sign_out"))
        self.sign_out_button.clicked.connect(self._sign_out)
        sidebar_layout.addWidget(self.sign_out_button)

        root_layout.addWidget(sidebar)

        content = QWidget()
        content_layout = QVBoxLayout(content)
        content_layout.setContentsMargins(0, 0, 0, 0)
        content_layout.setSpacing(0)

        self.stack = QStackedWidget()
        self.pages = [
            DashboardPage(session),
            ItemsPage(session),
            ReceiptsPage(session),
            IssuesPage(session),
            TransfersPage(session),
            AdjustmentsPage(session),
            StockTakesPage(session),
            StockPage(session),
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
        self.user_status = QLabel(f"User: {session.display_name}")
        self.user_status.setObjectName("Muted")
        self.status_bar.addWidget(self.gateway_status, 1)
        self.data_indicator = DataChangedIndicator(self.translator, self)
        self.data_indicator.refresh_requested.connect(self._refresh_current_page)
        self.status_bar.addPermanentWidget(self.data_indicator)
        self.language_selector = LanguageComboBox(self.translator, self)
        self.status_bar.addPermanentWidget(self.language_selector)
        self.status_bar.addPermanentWidget(self.user_status)
        self.status_bar.showMessage(self.translator.tr("status.ready"))

        channels = channels_for_permissions(
            self.session.permissions, ("monitor.today", "weighing.live")
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
        self.setWindowTitle(self.translator.tr("app.inventory"))
        self.product_label.setText(self.translator.tr("product.inventory"))
        for button, key in zip(self.nav_buttons, self._nav_keys):
            button.setText(self.translator.tr(key))
        self.roles_label.setText(
            ", ".join(self.session.roles) or self.translator.tr("status.no_roles")
        )
        self.sign_out_button.setText(self.translator.tr("action.sign_out"))
        self.status_bar.showMessage(self.translator.tr("status.ready"))

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

    def _sign_out(self) -> None:
        if confirm(self, "Sign out", self.translator.tr("action.sign_out") + "?"):
            self.session.logout()

    def closeEvent(self, event) -> None:
        if self.realtime is not None:
            self.realtime.stop()
        self.idle_lock.stop()
        event.accept()
