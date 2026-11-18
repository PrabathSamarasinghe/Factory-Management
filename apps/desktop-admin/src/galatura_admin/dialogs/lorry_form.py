"""Create and edit lorry dialogs."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from galatura_desktop_core.widgets import FormDialog
from PySide6.QtWidgets import QComboBox, QLineEdit, QWidget

LORRY_STATUSES = ["ACTIVE", "MAINTENANCE", "RETIRED"]


def _valid_date(value: str) -> bool:
    if not value:
        return True
    try:
        datetime.strptime(value, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def _date_text(value: Any) -> str:
    return str(value or "")[:10]


class LorryFormDialog(FormDialog):
    def __init__(self, lorry: dict[str, Any] | None = None, parent: QWidget | None = None):
        self.lorry = lorry
        self.is_edit = lorry is not None
        super().__init__("Edit lorry" if self.is_edit else "New lorry", parent)

        self.registration_input = QLineEdit()
        self.registration_input.setPlaceholderText("e.g. WP CAB 1234")
        self.make_input = QLineEdit()
        self.model_input = QLineEdit()
        self.year_input = QLineEdit()
        self.year_input.setPlaceholderText("Optional, e.g. 2018")
        self.chassis_input = QLineEdit()
        self.engine_input = QLineEdit()
        self.fuel_input = QLineEdit()
        self.fuel_input.setPlaceholderText("e.g. DIESEL")
        self.capacity_input = QLineEdit()
        self.capacity_input.setPlaceholderText("kg")
        self.tare_input = QLineEdit()
        self.tare_input.setPlaceholderText("kg")
        self.colour_input = QLineEdit()
        self.photo_input = QLineEdit()
        self.photo_input.setPlaceholderText("Object storage key")
        self.odometer_input = QLineEdit()
        self.odometer_input.setPlaceholderText("e.g. 152000.5")
        self.status_combo = QComboBox()
        for status in LORRY_STATUSES:
            self.status_combo.addItem(status.title(), status)
        self.insurance_input = QLineEdit()
        self.insurance_input.setPlaceholderText("YYYY-MM-DD")
        self.licence_input = QLineEdit()
        self.licence_input.setPlaceholderText("YYYY-MM-DD")
        self.emission_input = QLineEdit()
        self.emission_input.setPlaceholderText("YYYY-MM-DD")

        self.add_row("Registration no *", self.registration_input)
        self.add_row("Make *", self.make_input)
        self.add_row("Model *", self.model_input)
        self.add_row("Year", self.year_input)
        self.add_row("Chassis no", self.chassis_input)
        self.add_row("Engine no", self.engine_input)
        self.add_row("Fuel type", self.fuel_input)
        self.add_row("Capacity (kg)", self.capacity_input)
        self.add_row("Tare weight (kg)", self.tare_input)
        self.add_row("Colour", self.colour_input)
        self.add_row("Photo object key", self.photo_input)
        self.add_row("Current odometer (km) *", self.odometer_input)
        self.add_row("Status", self.status_combo)
        self.add_section("Statutory documents")
        self.add_row("Insurance expiry", self.insurance_input)
        self.add_row("Revenue licence expiry", self.licence_input)
        self.add_row("Emission test expiry", self.emission_input)
        self._populate()

    def _populate(self) -> None:
        if not self.lorry:
            self.odometer_input.setText("0")
            return
        values = {
            "registrationNo": self.registration_input,
            "make": self.make_input,
            "model": self.model_input,
            "year": self.year_input,
            "chassisNo": self.chassis_input,
            "engineNo": self.engine_input,
            "fuelType": self.fuel_input,
            "capacityKg": self.capacity_input,
            "tareWeightKg": self.tare_input,
            "colour": self.colour_input,
            "photoObjectKey": self.photo_input,
            "currentOdometerKm": self.odometer_input,
        }
        for key, widget in values.items():
            widget.setText("" if self.lorry.get(key) is None else str(self.lorry.get(key)))
        for key, widget in {
            "insuranceExpiry": self.insurance_input,
            "revenueLicenceExpiry": self.licence_input,
            "emissionTestExpiry": self.emission_input,
        }.items():
            widget.setText(_date_text(self.lorry.get(key)))
        index = self.status_combo.findData(self.lorry.get("status"))
        if index >= 0:
            self.status_combo.setCurrentIndex(index)

    def validate(self) -> str | None:
        if not self.registration_input.text().strip():
            return "Registration number is required."
        if not self.make_input.text().strip() or not self.model_input.text().strip():
            return "Make and model are required."
        try:
            float(self.odometer_input.text().strip() or "0")
        except ValueError:
            return "Current odometer must be a number."
        for label, value in (
            ("Year", self.year_input.text().strip()),
            ("Capacity", self.capacity_input.text().strip()),
            ("Tare weight", self.tare_input.text().strip()),
        ):
            if value:
                try:
                    float(value)
                except ValueError:
                    return f"{label} must be a number."
        for label, value in (
            ("Insurance expiry", self.insurance_input.text()),
            ("Revenue licence expiry", self.licence_input.text()),
            ("Emission test expiry", self.emission_input.text()),
        ):
            if not _valid_date(value.strip()):
                return f"{label} must be YYYY-MM-DD or blank."
        return None

    def collect(self) -> dict[str, Any]:
        return {
            "registrationNo": self.registration_input.text().strip().upper(),
            "make": self.make_input.text().strip(),
            "model": self.model_input.text().strip(),
            "year": _optional_int(self.year_input.text()),
            "chassisNo": _optional(self.chassis_input.text()),
            "engineNo": _optional(self.engine_input.text()),
            "fuelType": _optional(self.fuel_input.text()),
            "capacityKg": _optional(self.capacity_input.text()),
            "tareWeightKg": _optional(self.tare_input.text()),
            "colour": _optional(self.colour_input.text()),
            "photoObjectKey": _optional(self.photo_input.text()),
            "currentOdometerKm": self.odometer_input.text().strip() or "0",
            "status": self.status_combo.currentData(),
            "insuranceExpiry": _optional(self.insurance_input.text()),
            "revenueLicenceExpiry": _optional(self.licence_input.text()),
            "emissionTestExpiry": _optional(self.emission_input.text()),
        }


def _optional(value: str) -> str | None:
    text = value.strip()
    return text or None


def _optional_int(value: str) -> int | None:
    text = value.strip()
    if not text:
        return None
    return int(float(text))
