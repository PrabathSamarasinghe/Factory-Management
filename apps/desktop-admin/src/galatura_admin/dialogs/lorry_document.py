"""Lorry document and maintenance dialogs."""

from __future__ import annotations

from datetime import datetime

from galatura_desktop_core.widgets import FormDialog
from PySide6.QtWidgets import QComboBox, QLineEdit, QTextEdit, QWidget

DOC_TYPES = ["INSURANCE", "REVENUE_LICENCE", "EMISSION_TEST", "OTHER"]


def _date_ok(value: str) -> bool:
    if not value:
        return True
    try:
        datetime.strptime(value, "%Y-%m-%d")
        return True
    except ValueError:
        return False


class LorryDocumentDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None):
        super().__init__("Add lorry document", parent)
        self.doc_type = QComboBox()
        for value in DOC_TYPES:
            self.doc_type.addItem(value.replace("_", " ").title(), value)
        self.object_key = QLineEdit()
        self.object_key.setPlaceholderText("Object storage key")
        self.issued_on = QLineEdit()
        self.issued_on.setPlaceholderText("YYYY-MM-DD")
        self.expires_on = QLineEdit()
        self.expires_on.setPlaceholderText("YYYY-MM-DD")

        self.add_row("Document type", self.doc_type)
        self.add_row("Object key *", self.object_key)
        self.add_row("Issued on", self.issued_on)
        self.add_row("Expires on", self.expires_on)

    def validate(self) -> str | None:
        if not self.object_key.text().strip():
            return "Object key is required."
        if not _date_ok(self.issued_on.text().strip()):
            return "Issued on must be YYYY-MM-DD or blank."
        if not _date_ok(self.expires_on.text().strip()):
            return "Expires on must be YYYY-MM-DD or blank."
        return None

    def collect(self):
        return {
            "docType": self.doc_type.currentData(),
            "objectKey": self.object_key.text().strip(),
            "issuedOn": _optional(self.issued_on.text()),
            "expiresOn": _optional(self.expires_on.text()),
        }


class MaintenanceDialog(FormDialog):
    def __init__(self, odometer: str = "", parent: QWidget | None = None):
        super().__init__("Add maintenance record", parent)
        self.service_date = QLineEdit()
        self.service_date.setPlaceholderText("YYYY-MM-DD")
        self.odometer = QLineEdit(odometer)
        self.description = QTextEdit()
        self.description.setFixedHeight(70)
        self.cost = QLineEdit()
        self.vendor = QLineEdit()
        self.next_due_km = QLineEdit()
        self.next_due_date = QLineEdit()
        self.next_due_date.setPlaceholderText("YYYY-MM-DD")

        self.add_row("Service date *", self.service_date)
        self.add_row("Odometer (km) *", self.odometer)
        self.add_row("Description *", self.description)
        self.add_row("Cost", self.cost)
        self.add_row("Vendor", self.vendor)
        self.add_row("Next due odometer (km)", self.next_due_km)
        self.add_row("Next due date", self.next_due_date)

    def validate(self) -> str | None:
        if not _date_ok(self.service_date.text().strip()) or not self.service_date.text().strip():
            return "Service date must be YYYY-MM-DD."
        if not _date_ok(self.next_due_date.text().strip()):
            return "Next due date must be YYYY-MM-DD or blank."
        try:
            float(self.odometer.text().strip())
        except ValueError:
            return "Odometer must be a number."
        if not self.description.toPlainText().strip():
            return "Description is required."
        if self.cost.text().strip():
            try:
                float(self.cost.text().strip())
            except ValueError:
                return "Cost must be a number."
        return None

    def collect(self):
        return {
            "serviceDate": self.service_date.text().strip(),
            "odometerKm": self.odometer.text().strip(),
            "description": self.description.toPlainText().strip(),
            "cost": _optional(self.cost.text()),
            "vendor": _optional(self.vendor.text()),
            "nextDueKm": _optional(self.next_due_km.text()),
            "nextDueDate": _optional(self.next_due_date.text()),
        }


def _optional(value: str) -> str | None:
    text = value.strip()
    return text or None
