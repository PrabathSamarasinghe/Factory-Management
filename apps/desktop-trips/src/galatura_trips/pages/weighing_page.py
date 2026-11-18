"""Factory weighing: select a trip pickup, record weights and finalise totals."""

from __future__ import annotations

import re
from datetime import datetime, timezone
from decimal import Decimal
from typing import Any
from uuid import uuid4

from galatura_desktop_core import ApiError, SessionManager, human_error
from galatura_desktop_core.widgets import (
    PageHeader,
    StatusBanner,
    confirm,
    danger_button,
    format_date,
    ghost_button,
    primary_button,
    run_async,
)
from PySide6.QtWidgets import (
    QComboBox,
    QFormLayout,
    QFrame,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QVBoxLayout,
    QWidget,
)

_DECIMAL_PATTERN = re.compile(r"^\d+(\.\d{1,3})?$")


def _decimal_text(value: str, label: str) -> str:
    text = value.strip()
    if not _DECIMAL_PATTERN.fullmatch(text):
        raise ValueError(f"{label} must be a non-negative decimal with at most 3 places.")
    return text


def _as_decimal(value: str, label: str, default: str = "0") -> Decimal:
    return Decimal(_decimal_text(value.strip() or default, label))


def _timestamp(value: str) -> str:
    text = value.strip()
    if not text:
        raise ValueError("Weighed at is required.")
    try:
        parsed = datetime.fromisoformat(text.replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("Weighed at must be an ISO timestamp.") from exc
    return parsed.isoformat().replace("+00:00", "Z")


def _now() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


class WeighingPage(QWidget):
    def __init__(self, session: SessionManager):
        super().__init__()
        self.session = session
        self.pickups: list[dict[str, Any]] = []
        self.client_weighing_id = str(uuid4())
        self.last_readiness: dict[str, Any] = {}
        self._finalizing_trip_id: str | None = None
        self._selected_pickup_id: str | None = None

        layout = QVBoxLayout(self)
        layout.setContentsMargins(28, 24, 28, 24)
        layout.setSpacing(14)

        header = PageHeader(
            "Weighing",
            "Match a trip pickup to the factory weighbridge record and finalise totals.",
        )
        self.refresh_button = ghost_button("Refresh")
        self.refresh_button.clicked.connect(self.refresh)
        header.add_action(self.refresh_button)
        layout.addWidget(header)

        self.banner = StatusBanner()
        self.discrepancy_banner = StatusBanner()
        layout.addWidget(self.banner)
        layout.addWidget(self.discrepancy_banner)

        selections = QHBoxLayout()
        selections.setSpacing(10)
        selections.addWidget(QLabel("Trip"))
        self.trip_combo = QComboBox()
        self.trip_combo.currentIndexChanged.connect(self._load_trip_data)
        selections.addWidget(self.trip_combo, 2)
        selections.addWidget(QLabel("Supplier / pickup"))
        self.pickup_combo = QComboBox()
        self.pickup_combo.currentIndexChanged.connect(self._on_pickup_changed)
        selections.addWidget(self.pickup_combo, 3)
        layout.addLayout(selections)

        self.pickup_summary = QLabel("No pickup selected.")
        self.pickup_summary.setObjectName("Muted")
        self.pickup_summary.setWordWrap(True)
        layout.addWidget(self.pickup_summary)

        form_frame = QFrame()
        form_frame.setObjectName("Panel")
        form_layout = QFormLayout(form_frame)
        form_layout.setContentsMargins(18, 16, 18, 16)
        form_layout.setHorizontalSpacing(14)
        form_layout.setVerticalSpacing(10)

        self.gross_input = QLineEdit()
        self.gross_input.setPlaceholderText("e.g. 1200.500")
        self.tare_input = QLineEdit("0")
        self.deductions_input = QLineEdit("0")
        self.bags_input = QLineEdit()
        self.bags_input.setPlaceholderText("Whole number")
        self.quality_input = QLineEdit()
        self.quality_input.setPlaceholderText("Optional")
        self.scale_input = QLineEdit("MANUAL")
        self.weighed_at_input = QLineEdit(_now())
        self.net_label = QLabel("0.000")
        self.net_label.setStyleSheet("font-weight: 700;")

        for field in (
            self.gross_input,
            self.tare_input,
            self.deductions_input,
        ):
            field.textChanged.connect(self._update_net_and_warning)

        form_layout.addRow("Gross weight (kg)", self.gross_input)
        form_layout.addRow("Tare (kg)", self.tare_input)
        form_layout.addRow("Deductions (kg)", self.deductions_input)
        form_layout.addRow("Net weight (kg)", self.net_label)
        form_layout.addRow("Bags", self.bags_input)
        form_layout.addRow("Quality grade", self.quality_input)
        form_layout.addRow("Scale ID", self.scale_input)
        form_layout.addRow("Weighed at", self.weighed_at_input)
        layout.addWidget(form_frame, 1)

        self.readiness_label = QLabel("Readiness not checked.")
        self.readiness_label.setObjectName("Muted")
        self.readiness_label.setWordWrap(True)
        layout.addWidget(self.readiness_label)

        actions = QHBoxLayout()
        actions.setSpacing(8)
        self.readiness_button = primary_button("Check readiness")
        self.readiness_button.clicked.connect(self.check_readiness)
        self.submit_button = primary_button("Record weighing")
        self.submit_button.clicked.connect(self.record_weighing)
        self.finalize_button = danger_button("Finalize trip")
        self.finalize_button.clicked.connect(self.finalize_trip)
        actions.addWidget(self.readiness_button)
        actions.addWidget(self.submit_button)
        actions.addWidget(self.finalize_button)
        actions.addStretch(1)
        layout.addLayout(actions)

        self.submit_button.setEnabled(self.session.has_permission("collection:weigh"))
        self.readiness_button.setEnabled(self.session.has_permission("collection:review"))
        self.finalize_button.setEnabled(self.session.has_permission("collection:finalize"))

    def refresh(self) -> None:
        self.banner.clear()
        if not (
            self.session.has_permission("collection:weigh")
            or self.session.has_permission("collection:review")
        ):
            self.banner.show_error("Your role does not include collection permissions.")
            return
        run_async(lambda: self.session.fleet.list_trips() or [], self._apply_trips, self._on_error)

    def _apply_trips(self, trips: list[dict[str, Any]]) -> None:
        selected = self.trip_combo.currentData()
        self.trip_combo.blockSignals(True)
        self.trip_combo.clear()
        for trip in trips:
            route = trip.get("route") or {}
            lorry = trip.get("lorry") or {}
            label = (
                f"{format_date(trip.get('tripDate'))} | "
                f"{route.get('code') or '-'} | {lorry.get('registrationNo') or '-'}"
            )
            self.trip_combo.addItem(label, trip.get("id"))
        index = self.trip_combo.findData(selected) if selected else -1
        if index >= 0:
            self.trip_combo.setCurrentIndex(index)
        elif self.trip_combo.count():
            self.trip_combo.setCurrentIndex(0)
        self.trip_combo.blockSignals(False)
        self._load_trip_data()

    def _load_trip_data(self, _index: int | None = None) -> None:
        self.banner.clear()
        self.discrepancy_banner.clear()
        self.readiness_label.setText("Readiness not checked.")
        self.last_readiness = {}
        selected_pickup = self.pickup_combo.currentData() or {}
        self._selected_pickup_id = str(selected_pickup.get("id") or "") or None
        self.pickup_combo.blockSignals(True)
        self.pickup_combo.clear()
        self.pickup_combo.blockSignals(False)
        self.pickup_summary.setText("No pickup selected.")
        trip_id = self.trip_combo.currentData()
        if not trip_id:
            return
        run_async(lambda: self._load_trip(trip_id), self._apply_trip_data, self._on_error)

    def _load_trip(self, trip_id: str) -> dict[str, Any]:
        pickups = self.session.collection.list_pickups(trip_id) or []
        readiness: dict[str, Any] = {}
        if self.session.has_permission("collection:review"):
            try:
                readiness = self.session.collection.get_readiness(trip_id) or {}
            except ApiError:
                readiness = {}
        return {"pickups": pickups, "readiness": readiness}

    def _apply_trip_data(self, data: dict[str, Any]) -> None:
        self.pickups = list(data.get("pickups") or [])
        selected = self._selected_pickup_id
        self.pickup_combo.blockSignals(True)
        self.pickup_combo.clear()
        for pickup in self.pickups:
            label = (
                f"{pickup.get('supplierRegNo') or pickup.get('supplierId') or '-'} | "
                f"{pickup.get('grossWeightKg') or '-'} kg | "
                f"{format_date(pickup.get('recordedAtDevice'))}"
            )
            self.pickup_combo.addItem(label, pickup)
        index = next(
            (
                i
                for i in range(self.pickup_combo.count())
                if (
                    selected
                    and str((self.pickup_combo.itemData(i) or {}).get("id") or "") == selected
                )
            ),
            -1,
        )
        if index >= 0:
            self.pickup_combo.setCurrentIndex(index)
        elif self.pickup_combo.count():
            self.pickup_combo.setCurrentIndex(0)
        self.pickup_combo.blockSignals(False)
        self._apply_readiness(data.get("readiness") or {})
        self._on_pickup_changed()

    def _on_pickup_changed(self, _index: int | None = None) -> None:
        pickup = self.pickup_combo.currentData()
        if not pickup:
            self.pickup_summary.setText("No pickup selected.")
            self.discrepancy_banner.clear()
            self._update_net_and_warning()
            return
        self.pickup_summary.setText(
            f"Pickup {pickup.get('id') or '-'} | "
            f"supplier {pickup.get('supplierRegNo') or pickup.get('supplierId') or '-'} | "
            f"field gross {pickup.get('grossWeightKg') or '-'} kg, "
            f"tare {pickup.get('tareKg') or '-'} kg, "
            f"moisture {pickup.get('moistureDeductionKg') or '-'} kg, "
            f"bags {pickup.get('bagsCount') or '-'}"
        )
        self._update_net_and_warning()

    def _net_weight(self) -> Decimal:
        gross = _as_decimal(self.gross_input.text(), "Gross weight", "")
        tare = _as_decimal(self.tare_input.text(), "Tare")
        deductions = _as_decimal(self.deductions_input.text(), "Deductions")
        net = gross - tare - deductions
        if net < 0:
            raise ValueError("Net weight cannot be negative.")
        return net

    def _field_net(self, pickup: dict[str, Any]) -> Decimal | None:
        try:
            gross = _as_decimal(str(pickup.get("grossWeightKg") or ""), "Field gross weight")
            tare = _as_decimal(str(pickup.get("tareKg") or "0"), "Field tare")
            moisture = _as_decimal(
                str(pickup.get("moistureDeductionKg") or "0"), "Field moisture deduction"
            )
        except ValueError:
            return None
        return gross - tare - moisture

    def _update_net_and_warning(self) -> None:
        self.discrepancy_banner.clear()
        try:
            net = self._net_weight()
        except ValueError:
            self.net_label.setText("-")
            return
        self.net_label.setText(format(net, "f"))

        pickup = self.pickup_combo.currentData()
        if not pickup:
            return
        field = self._field_net(pickup)
        if field is None or field <= 0:
            return
        diff_pct = abs(net - field) / field * Decimal("100")
        if diff_pct > Decimal("2"):
            self.discrepancy_banner.show_info(
                f"Factory net differs from the pickup by {format(diff_pct, '.2f')}% "
                f"({format(net, 'f')} kg vs {format(field, 'f')} kg). "
                "A discrepancy will be recorded."
            )

    def check_readiness(self) -> None:
        if not self.session.has_permission("collection:review"):
            self.banner.show_error("Your role cannot review collection readiness.")
            return
        trip_id = self.trip_combo.currentData()
        if not trip_id:
            self.banner.show_info("Select a trip first.")
            return
        run_async(
            lambda: self.session.collection.get_readiness(trip_id),
            self._apply_readiness,
            self._on_error,
        )

    def _apply_readiness(self, readiness: dict[str, Any]) -> None:
        self.last_readiness = readiness
        if readiness.get("ready"):
            text = "Ready: every pickup has been weighed and its totals finalised."
            self.readiness_label.setText(text)
            self.banner.show_success(text)
            return
        pending = readiness.get("pendingSupplierIds") or []
        text = "Pending suppliers: " + (", ".join(str(value) for value in pending) or "-")
        self.readiness_label.setText(text)
        self.banner.show_info("This trip is not ready to finalise yet.")

    def record_weighing(self) -> None:
        if not self.session.has_permission("collection:weigh"):
            self.banner.show_error("Your role cannot record factory weighings.")
            return
        pickup = self.pickup_combo.currentData()
        trip_id = self.trip_combo.currentData()
        if not pickup or not trip_id:
            self.banner.show_info("Select a trip and pickup first.")
            return
        try:
            gross = _decimal_text(self.gross_input.text(), "Gross weight")
            tare = _as_decimal(self.tare_input.text(), "Tare")
            deductions = _as_decimal(self.deductions_input.text(), "Deductions")
            net = _as_decimal(gross, "Gross weight") - tare - deductions
            if net < 0:
                raise ValueError("Net weight cannot be negative.")
            bags_text = self.bags_input.text().strip()
            bags = int(bags_text)
            if bags <= 0:
                raise ValueError("Bags must be a positive whole number.")
            weighed_at = _timestamp(self.weighed_at_input.text())
        except ValueError as exc:
            self.banner.show_error(str(exc))
            return

        payload: dict[str, Any] = {
            "clientWeighingId": self.client_weighing_id,
            "tripId": trip_id,
            "supplierId": pickup.get("supplierId"),
            "pickupId": pickup.get("id"),
            "grossWeightKg": gross,
            "tareKg": format(tare, "f"),
            "netWeightKg": format(net, "f"),
            "bagsCount": bags,
            "deductionsKg": format(deductions, "f"),
            "qualityGrade": self.quality_input.text().strip() or None,
            "scaleId": self.scale_input.text().strip() or "MANUAL",
            "weighedAt": weighed_at,
        }
        self.banner.clear()
        run_async(
            lambda: self.session.collection.record_weighing(payload),
            self._on_recorded,
            self._on_error,
        )

    def _on_recorded(self, _result: dict[str, Any]) -> None:
        self.client_weighing_id = str(uuid4())
        self._load_trip_data()
        self.banner.show_success("Weighing recorded.")

    def finalize_trip(self) -> None:
        if not self.session.has_permission("collection:finalize"):
            self.banner.show_error("Your role cannot finalise collection totals.")
            return
        trip_id = self.trip_combo.currentData()
        if not trip_id:
            self.banner.show_info("Select a trip first.")
            return
        self._finalizing_trip_id = trip_id
        if self.last_readiness and self.last_readiness.get("ready"):
            self._confirm_finalize(self.last_readiness)
            return
        run_async(
            lambda: self._readiness_for_finalize(trip_id),
            self._confirm_finalize,
            self._on_error,
        )

    def _readiness_for_finalize(self, trip_id: str) -> dict[str, Any]:
        try:
            return self.session.collection.get_readiness(trip_id) or {}
        except ApiError:
            return {}

    def _confirm_finalize(self, readiness: dict[str, Any]) -> None:
        trip_id = self._finalizing_trip_id
        if not trip_id:
            return
        if readiness and not readiness.get("ready"):
            self.banner.show_error("Every pickup must be weighed before totals can be finalised.")
            return
        question = "Finalise daily totals for this trip? This cannot be undone."
        if not readiness:
            question = "Readiness could not be verified. Finalise daily totals anyway?"
        if not confirm(self, "Finalize trip", question):
            self.banner.show_info("Finalisation cancelled.")
            return
        run_async(
            lambda: self.session.collection.finalize_trip(trip_id),
            self._on_finalized,
            self._on_error,
        )

    def _on_finalized(self, _result: list[dict[str, Any]]) -> None:
        self._load_trip_data()
        self.banner.show_success("Daily totals finalised for the trip.")

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))
