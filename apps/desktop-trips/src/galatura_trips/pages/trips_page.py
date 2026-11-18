"""Trip start, arrival, cancellation and end actions for the C4 client."""

from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any
from uuid import uuid4

from galatura_desktop_core import SessionManager, human_error
from galatura_desktop_core.widgets import (
    DataTable,
    FormDialog,
    PageHeader,
    StatusBanner,
    confirm,
    danger_button,
    format_date,
    format_datetime,
    ghost_button,
    primary_button,
    run_async,
)
from PySide6.QtWidgets import QHBoxLayout, QLineEdit, QVBoxLayout, QWidget


def _decimal_text(value: Any, label: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{label} is required.")
    try:
        number = Decimal(text)
    except InvalidOperation as exc:
        raise ValueError(f"{label} must be a decimal number.") from exc
    if not number.is_finite() or number < 0:
        raise ValueError(f"{label} must be a non-negative decimal.")
    return format(number, "f")


class StartTripDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None) -> None:
        super().__init__("Start trip", parent)
        self.route_input = QLineEdit()
        self.lorry_input = QLineEdit()
        self.driver_input = QLineEdit()
        self.helper_input = QLineEdit()
        self.supervisor_input = QLineEdit()
        self.date_input = QLineEdit(date.today().isoformat())
        self.odometer_input = QLineEdit()
        self.odometer_input.setPlaceholderText("Current lorry odometer in km")
        self.remarks_input = QLineEdit()

        self.add_row("Route ID", self.route_input)
        self.add_row("Lorry ID", self.lorry_input)
        self.add_row("Driver ID (optional)", self.driver_input)
        self.add_row("Helper ID (optional)", self.helper_input)
        self.add_row("Supervisor ID (optional)", self.supervisor_input)
        self.add_row("Trip date", self.date_input)
        self.add_row("Start odometer (km)", self.odometer_input)
        self.add_row("Remarks (optional)", self.remarks_input)

    def validate(self) -> str | None:
        for value, label in (
            (self.route_input.text(), "Route ID"),
            (self.lorry_input.text(), "Lorry ID"),
            (self.date_input.text(), "Trip date"),
        ):
            if not value.strip():
                return f"{label} is required."
        try:
            _decimal_text(self.odometer_input.text(), "Start odometer")
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "clientTripId": str(uuid4()),
            "routeId": self.route_input.text().strip(),
            "lorryId": self.lorry_input.text().strip(),
            "tripDate": self.date_input.text().strip(),
            "startOdometerKm": _decimal_text(self.odometer_input.text(), "Start odometer"),
            "remarks": self.remarks_input.text().strip() or None,
        }
        for key, widget in (
            ("driverId", self.driver_input),
            ("helperId", self.helper_input),
            ("supervisorId", self.supervisor_input),
        ):
            value = widget.text().strip()
            if value:
                payload[key] = value
        return payload


class EndTripDialog(FormDialog):
    def __init__(self, trip: dict[str, Any], parent: QWidget | None = None) -> None:
        super().__init__("End trip", parent)
        self.odometer_input = QLineEdit(str(trip.get("startOdometerKm") or ""))
        self.remarks_input = QLineEdit()
        self.add_row("End odometer (km)", self.odometer_input)
        self.add_row("Remarks (optional)", self.remarks_input)

    def validate(self) -> str | None:
        try:
            _decimal_text(self.odometer_input.text(), "End odometer")
        except ValueError as exc:
            return str(exc)
        return None

    def collect(self) -> dict[str, Any]:
        return {
            "endOdometerKm": _decimal_text(self.odometer_input.text(), "End odometer"),
            "remarks": self.remarks_input.text().strip() or None,
        }


class TripsPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session
        self.trips: list[dict[str, Any]] = []

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(14)

        header = PageHeader(
            "Trips",
            "Start a trip, mark factory arrival and end it after weighing is finalised.",
        )
        self.refresh_button = ghost_button("Refresh")
        self.refresh_button.clicked.connect(self.refresh)
        header.add_action(self.refresh_button)
        layout.addWidget(header)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        self.table = DataTable(
            [
                ("tripDate", "Date", 110),
                ("status", "Status", 130),
                ("routeLabel", "Route", 220),
                ("lorryLabel", "Lorry", 180),
                ("startedAtLabel", "Started", 150),
                ("endedAtLabel", "Ended", 150),
                ("id", "Trip ID"),
            ]
        )
        self.table.set_formatter("startedAtLabel", lambda value, _row: str(value or "-"))
        self.table.set_formatter("endedAtLabel", lambda value, _row: str(value or "-"))
        layout.addWidget(self.table, 1)

        actions = QHBoxLayout()
        actions.setSpacing(8)
        self.start_button = primary_button("Start trip")
        self.start_button.clicked.connect(self.start_trip)
        self.arrive_button = primary_button("Arrive at factory")
        self.arrive_button.clicked.connect(self.arrive_factory)
        self.end_button = danger_button("End trip")
        self.end_button.clicked.connect(self.end_trip)
        self.cancel_button = danger_button("Cancel trip")
        self.cancel_button.clicked.connect(self.cancel_trip)
        for button in (
            self.start_button,
            self.arrive_button,
            self.end_button,
            self.cancel_button,
        ):
            actions.addWidget(button)
        actions.addStretch(1)
        layout.addLayout(actions)

        self.start_button.setEnabled(self.session.has_permission("trip:create"))
        self.arrive_button.setEnabled(self.session.has_permission("trip:update"))
        self.end_button.setEnabled(self.session.has_permission("trip:end"))
        self.cancel_button.setEnabled(self.session.has_permission("trip:cancel"))

    def refresh(self) -> None:
        self.banner.clear()
        if not self.session.has_permission("trip:read"):
            self.banner.show_error("Your role does not include trip:read.")
            return
        run_async(lambda: self.session.fleet.list_trips() or [], self._apply_trips, self._on_error)

    def _apply_trips(self, trips: list[dict[str, Any]]) -> None:
        self.trips = trips
        rows: list[dict[str, Any]] = []
        for trip in trips:
            route = trip.get("route") or {}
            lorry = trip.get("lorry") or {}
            rows.append(
                {
                    **trip,
                    "tripDate": format_date(trip.get("tripDate")),
                    "routeLabel": route.get("code") or route.get("name") or "-",
                    "lorryLabel": lorry.get("registrationNo") or "-",
                    "startedAtLabel": format_datetime(trip.get("startedAt")),
                    "endedAtLabel": format_datetime(trip.get("endedAt")),
                }
            )
        self.table.set_rows(rows)

    def _selected_trip(self) -> dict[str, Any] | None:
        return self.table.selected_row()

    def start_trip(self) -> None:
        dialog = StartTripDialog(self)
        if not dialog.exec():
            return
        payload = dialog.payload
        run_async(
            lambda: self.session.fleet.start_trip(payload),
            lambda _result: self._on_success("Trip started."),
            self._on_error,
        )

    def arrive_factory(self) -> None:
        trip = self._selected_trip()
        if not trip:
            self.banner.show_info("Select a trip first.")
            return
        trip_id = str(trip.get("id") or "")
        if not confirm(self, "Factory arrival", "Mark this trip as arrived at the factory?"):
            return
        run_async(
            lambda: self.session.fleet.arrive_factory(trip_id),
            lambda _result: self._on_success("Factory arrival recorded."),
            self._on_error,
        )

    def end_trip(self) -> None:
        trip = self._selected_trip()
        if not trip:
            self.banner.show_info("Select a trip first.")
            return
        dialog = EndTripDialog(trip, self)
        if not dialog.exec():
            return
        trip_id = str(trip.get("id") or "")
        payload = dialog.payload
        run_async(
            lambda: self.session.fleet.end_trip(trip_id, payload),
            lambda _result: self._on_success("Trip ended."),
            self._on_error,
        )

    def cancel_trip(self) -> None:
        trip = self._selected_trip()
        if not trip:
            self.banner.show_info("Select a trip first.")
            return
        trip_id = str(trip.get("id") or "")
        if not confirm(self, "Cancel trip", "Cancel this trip? This cannot be undone."):
            return
        run_async(
            lambda: self.session.fleet.cancel_trip(trip_id),
            lambda _result: self._on_success("Trip cancelled."),
            self._on_error,
        )

    def _on_success(self, message: str) -> None:
        self.banner.show_success(message)
        self.refresh()

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))
