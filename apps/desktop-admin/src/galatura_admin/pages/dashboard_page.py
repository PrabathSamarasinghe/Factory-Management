"""Overview dashboard with local identity data and monitor read models."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core import ApiError, SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    PageHeader,
    StatCard,
    StatusBanner,
    format_bool,
    format_date,
    format_datetime,
    format_money,
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


def _rows_of(value: Any, *keys: str) -> list[dict[str, Any]]:
    if isinstance(value, list):
        return [row for row in value if isinstance(row, dict)]
    if isinstance(value, dict):
        for key in (*keys, "rows", "data", "items"):
            candidate = value.get(key)
            if isinstance(candidate, list):
                return [row for row in candidate if isinstance(row, dict)]
            if isinstance(candidate, dict):
                nested = _rows_of(candidate)
                if nested:
                    return nested
    return []


def _details_of(value: Any, *keys: str) -> dict[str, Any]:
    if isinstance(value, dict):
        for key in keys:
            candidate = value.get(key)
            if isinstance(candidate, dict):
                return candidate
        return value
    return {}


def _pick(value: Any, *keys: str) -> Any:
    if not isinstance(value, dict):
        return None
    for key in keys:
        candidate = value.get(key)
        if candidate is not None:
            return candidate
    for candidate in value.values():
        if isinstance(candidate, dict):
            found = _pick(candidate, *keys)
            if found is not None:
                return found
    return None


def _monitor_rows(value: Any, mapping: dict[str, tuple[str, ...]]) -> list[dict[str, Any]]:
    return [
        {target: _pick(row, *aliases) for target, aliases in mapping.items()}
        for row in _rows_of(value)
    ]


def _number_text(value: Any, suffix: str = "") -> str:
    if value is None or value == "":
        return "-"
    return f"{value}{suffix}"


class DashboardPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(18)

        header = PageHeader(
            "Dashboard",
            "A quick health check of identity records and live monitor projections.",
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

        monitor_cards = QHBoxLayout()
        monitor_cards.setSpacing(14)
        self.kg_card = StatCard("Leaf collected (kg)")
        self.trips_card = StatCard("Trips running")
        self.present_card = StatCard("Present today")
        self.payables_card = StatCard("Payables")
        self.alerts_card = StatCard("Stock alerts")
        for card in (
            self.kg_card,
            self.trips_card,
            self.present_card,
            self.payables_card,
            self.alerts_card,
        ):
            monitor_cards.addWidget(card, 1)
        layout.addLayout(monitor_cards)

        monitor_frame = QFrame()
        monitor_frame.setObjectName("Card")
        monitor_frame_layout = QVBoxLayout(monitor_frame)
        monitor_frame_layout.setContentsMargins(18, 16, 18, 16)
        monitor_frame_layout.setSpacing(10)

        monitor_title = QLabel("Monitor read models")
        monitor_title.setObjectName("PageTitle")
        monitor_title.setStyleSheet("font-size: 12pt;")
        monitor_frame_layout.addWidget(monitor_title)

        monitor_tables = QHBoxLayout()
        monitor_tables.setSpacing(12)

        self.trips_table = DataTable(
            [
                ("id", "Trip", 150),
                ("status", "Status", 120),
                ("lorryRegistration", "Lorry", 130),
                ("currentStop", "Stop", 120),
                ("startedAt", "Started", 140),
            ]
        )
        self.trips_table.set_formatter("startedAt", lambda value, _row: format_datetime(value))

        self.attendance_table = DataTable(
            [
                ("date", "Date", 120),
                ("status", "Status", 120),
                ("count", "Count", 90),
                ("employeeId", "Employee", 150),
            ]
        )
        self.attendance_table.set_formatter("date", lambda value, _row: format_date(value))

        self.alerts_table = DataTable(
            [
                ("itemName", "Item", 150),
                ("itemId", "Item ID", 150),
                ("warehouseName", "Warehouse", 120),
                ("qtyOnHand", "On hand", 100),
                ("reorderLevel", "Reorder", 100),
            ]
        )

        for title, table in (
            ("Trips", self.trips_table),
            ("Attendance", self.attendance_table),
            ("Stock alerts", self.alerts_table),
        ):
            panel = QFrame()
            panel.setObjectName("Card")
            panel_layout = QVBoxLayout(panel)
            panel_layout.setContentsMargins(10, 8, 10, 8)
            panel_layout.setSpacing(6)
            panel_title = QLabel(title)
            panel_title.setObjectName("PageTitle")
            panel_title.setStyleSheet("font-size: 11pt;")
            panel_layout.addWidget(panel_title)
            panel_layout.addWidget(table, 1)
            table.setMinimumHeight(180)
            monitor_tables.addWidget(panel, 1)

        monitor_frame_layout.addLayout(monitor_tables, 1)
        layout.addWidget(monitor_frame, 2)

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
        self.audit_table.setMinimumHeight(200)
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

        monitor = getattr(self.session, "monitoring", None)
        monitor_data: dict[str, Any] = {"available": monitor is not None}

        if monitor is not None:
            def read(label: str, call: Any) -> None:
                try:
                    monitor_data[label] = call() or {}
                except Exception as exc:
                    errors = monitor_data.setdefault("errors", [])
                    errors.append(f"{label}: {human_error(exc)}")

            read("today", monitor.today)
            read("trips", monitor.trips)
            read("attendance", monitor.attendance)
            read("alerts", monitor.inventory)
            if self.session.has_permission("monitor:finance"):
                read("finance", monitor.finance)

        return {
            "users": users,
            "supplier_total": (suppliers.get("page") or {}).get("total", 0),
            "pending_total": len(pending),
            "audit": audit_rows,
            "audit_error": audit_error,
            "monitor": monitor_data,
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

        monitor = data.get("monitor") or {}
        today = _details_of(monitor.get("today"), "today", "summary", "totals")
        finance = _details_of(monitor.get("finance"), "finance", "totals")
        attendance = monitor.get("attendance")
        alerts = monitor.get("alerts")

        self.kg_card.set_value(
            _number_text(
                _pick(today, "kgCollected", "collectedKg", "totalNetKg", "kg"), " kg"
            )
        )
        self.trips_card.set_value(
            _number_text(_pick(today, "tripsRunning", "runningTrips", "activeTrips"))
        )
        self.present_card.set_value(
            _number_text(
                _pick(
                    today,
                    "presentToday",
                    "present",
                    "attendanceCount",
                )
                or _pick(_details_of(attendance), "presentToday", "present", "count")
            )
        )
        self.payables_card.set_value(format_money(_pick(finance, "payables", "totalPayables")))

        trip_rows = _monitor_rows(
            monitor.get("trips"),
            {
                "id": ("id", "tripId"),
                "status": ("status", "state"),
                "lorryRegistration": ("lorryRegistration", "lorryRegNo", "registrationNo"),
                "currentStop": ("currentStop", "stopName", "lastStop"),
                "startedAt": ("startedAt", "startedAtUtc", "at"),
            },
        )
        attendance_rows = _monitor_rows(
            attendance,
            {
                "date": ("date", "collectionDate", "day"),
                "status": ("status", "attendanceStatus"),
                "count": ("count", "total", "present"),
                "employeeId": ("employeeId", "personId", "supplierId"),
            },
        )
        alert_rows = _monitor_rows(
            alerts,
            {
                "itemName": ("itemName", "name"),
                "itemId": ("itemId", "id"),
                "warehouseName": ("warehouseName", "warehouse", "locationName"),
                "qtyOnHand": ("qtyOnHand", "onHand", "balanceQty"),
                "reorderLevel": ("reorderLevel", "reorderQty"),
            },
        )
        self.trips_table.set_rows(trip_rows)
        self.attendance_table.set_rows(attendance_rows)
        self.alerts_table.set_rows(alert_rows)

        alert_count = len(alert_rows) if alert_rows else _pick(_details_of(alerts), "count", "total")
        self.alerts_card.set_value("-" if alert_count is None else alert_count)

        if not monitor.get("available"):
            self.banner.show_info("Monitor projections are unavailable; showing local data only.")
        elif monitor.get("errors"):
            self.banner.show_info(
                "Some monitor projections are unavailable: "
                + "; ".join(str(error) for error in monitor["errors"])
            )
        if data.get("audit_error"):
            self.banner.show_info(
                "Authentication events are unavailable: " + str(data["audit_error"])
            )

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))
