"""Main accounts window with sidebar navigation and connection status."""

from __future__ import annotations

from galatura_desktop_core import SessionManager
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

from .pages.bills_page import BillsPage
from .pages.chart_of_accounts_page import ChartOfAccountsPage
from .pages.dashboard_page import DashboardPage
from .pages.journal_page import JournalPage
from .pages.ledger_page import LedgerPage
from .pages.payments_page import PaymentsPage
from .pages.payroll_page import PayrollPage
from .pages.periods_page import PeriodsPage
from .pages.reports_page import ReportsPage


class MainWindow(QMainWindow):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session
        self.setWindowTitle("Galatura Accounts")
        self.resize(1400, 880)
        self.setMinimumSize(1120, 700)

        root = QWidget()
        self.setCentralWidget(root)
        root_layout = QHBoxLayout(root)
        root_layout.setContentsMargins(0, 0, 0, 0)
        root_layout.setSpacing(0)

        sidebar = QFrame()
        sidebar.setObjectName("Sidebar")
        sidebar.setFixedWidth(240)
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
        product = QLabel("Accounts")
        product.setObjectName("Title")
        product.setStyleSheet("font-size: 14pt;")
        sidebar_layout.addWidget(product)
        sidebar_layout.addSpacing(14)

        self.nav_group = QButtonGroup(self)
        self.nav_group.setExclusive(True)
        self.nav_buttons: list[QPushButton] = []
        labels = [
            "Dashboard",
            "Chart of Accounts",
            "Journal",
            "Ledger & T-account",
            "Bills & Payables",
            "Payroll",
            "Payments",
            "Reports",
            "Periods & Reconciliation",
        ]
        for index, label in enumerate(labels):
            button = QPushButton(label)
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
        self.roles_label = QLabel(", ".join(session.roles) or "No roles")
        self.roles_label.setObjectName("Muted")
        self.roles_label.setWordWrap(True)
        user_layout.addWidget(self.user_label)
        user_layout.addWidget(self.roles_label)
        sidebar_layout.addWidget(user_frame)

        sign_out_button = ghost_button("Sign out")
        sign_out_button.clicked.connect(self._sign_out)
        sidebar_layout.addWidget(sign_out_button)

        root_layout.addWidget(sidebar)

        content = QWidget()
        content_layout = QVBoxLayout(content)
        content_layout.setContentsMargins(0, 0, 0, 0)
        content_layout.setSpacing(0)

        self.stack = QStackedWidget()
        self.pages = [
            DashboardPage(session),
            ChartOfAccountsPage(session),
            JournalPage(session),
            LedgerPage(session),
            BillsPage(session),
            PayrollPage(session),
            PaymentsPage(session),
            ReportsPage(session),
            PeriodsPage(session),
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
        self.status_bar.addPermanentWidget(self.user_status)
        self.status_bar.showMessage("Ready")

        self._switch(0)

    def _switch(self, index: int) -> None:
        self.stack.setCurrentIndex(index)
        if 0 <= index < len(self.nav_buttons):
            self.nav_buttons[index].setChecked(True)
        page = self.pages[index]
        refresh = getattr(page, "refresh", None)
        if callable(refresh):
            refresh()

    def _sign_out(self) -> None:
        if confirm(self, "Sign out", "Sign out of the accounts client?"):
            self.session.logout()

    def closeEvent(self, event) -> None:
        event.accept()
