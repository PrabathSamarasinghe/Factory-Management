"""Overview dashboard."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import ApiError, SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    PageHeader,
    StatCard,
    StatusBanner,
    format_bool,
    format_datetime,
    ghost_button,
    run_async,
)
from PySide6.QtWidgets import (
    QFrame,
    QHBoxLayout,
    QLabel,
    QVBoxLayout,
    QWidget,
)


class DashboardPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(18)

        header = PageHeader(
            "Dashboard",
            "A quick health check of accounts, suppliers and pending approvals.",
        )
        refresh = ghost_button("Refresh")
        refresh.clicked.connect(self.refresh)
        header.add_action(refresh)
        layout.addWidget(header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        cards = QHBoxLayout()
        cards.setSpacing(14)
        self.users_card = StatCard("Users")
        self.active_card = StatCard("Active users")
        self.suppliers_card = StatCard("Suppliers")
        self.pending_card = StatCard("Pending approvals")
        for card in (
            self.users_card,
            self.active_card,
            self.suppliers_card,
            self.pending_card,
        ):
            cards.addWidget(card, 1)
        layout.addLayout(cards)

        recent = QFrame()
        recent.setObjectName("Card")
        recent_layout = QVBoxLayout(recent)
        recent_layout.setContentsMargins(18, 16, 18, 16)
        recent_layout.setSpacing(10)

        recent_title = QLabel("Recent authentication events")
        recent_title.setObjectName("PageTitle")
        recent_title.setStyleSheet("font-size: 12pt;")
        recent_layout.addWidget(recent_title)

        self.audit_table = DataTable(
            [
                ("at", "When", 150),
                ("event", "Event", 230),
                ("user", "User", 160),
                ("success", "Result", 90),
                ("ip", "IP", 130),
            ]
        )
        self.audit_table.setMinimumHeight(260)
        recent_layout.addWidget(self.audit_table)

        layout.addWidget(recent, 1)

    def refresh(self) -> None:
        self.banner.clear()
        run_async(self._load, self._apply, self._on_error)

    def _load(self) -> dict[str, Any]:
        users = self.session.identity.list_users(limit=200) or []
        suppliers = (
            self.session.people.list_persons(person_type="SUPPLIER", limit=1) or {}
        )
        pending = self.session.identity.list_permission_requests("PENDING") or []

        audit_rows: list[dict[str, Any]] = []
        audit_error: str | None = None
        try:
            audit = self.session.identity.list_audit_logs(limit=10) or {}
            audit_rows = list(audit.get("data") or [])
        except ApiError as exc:
            audit_error = str(exc)

        return {
            "users": users,
            "supplier_total": (suppliers.get("page") or {}).get("total", 0),
            "pending_total": len(pending),
            "audit": audit_rows,
            "audit_error": audit_error,
        }

    def _apply(self, data: dict[str, Any]) -> None:
        users = data["users"]
        self.users_card.set_value(len(users))
        self.active_card.set_value(
            sum(1 for user in users if str(user.get("status")) == "ACTIVE")
        )
        self.suppliers_card.set_value(data["supplier_total"])
        self.pending_card.set_value(data["pending_total"])

        rows = []
        for event in data["audit"]:
            user = event.get("user") or {}
            rows.append(
                {
                    "at": format_datetime(event.get("at")),
                    "event": str(event.get("event") or "").replace("_", " ").title(),
                    "user": user.get("username") or event.get("userId") or "-",
                    "success": format_bool(event.get("success"), yes="OK", no="Failed"),
                    "ip": event.get("ip") or "-",
                }
            )
        self.audit_table.set_rows(rows)

        if data.get("audit_error"):
            self.banner.show_info(
                "Authentication events are unavailable: " + str(data["audit_error"])
            )

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))
