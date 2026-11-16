"""Create and edit person dialogs."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from galatura_desktop_core.widgets import FormDialog
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QFormLayout,
    QLineEdit,
    QStackedWidget,
    QWidget,
)

PERSON_TYPES = ["EMPLOYEE", "STAFF", "SUPPLIER", "ADMIN"]
WAGE_TYPES = ["DAILY", "MONTHLY", "PER_KG", "PIECE"]
STAFF_ROLES = ["DRIVER", "HELPER", "TRIP_SUPERVISOR", "CLERK"]
PAYMENT_METHODS = ["BANK", "CASH", "CHEQUE"]


def _valid_date(value: str) -> bool:
    if not value:
        return True
    try:
        datetime.strptime(value, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def _date_text(value: Any) -> str:
    if not value:
        return ""
    return str(value)[:10]


class PersonFormDialog(FormDialog):
    def __init__(
        self, person: dict[str, Any] | None = None, parent: QWidget | None = None
    ):
        self.person = person
        self.is_edit = person is not None
        super().__init__("Edit person" if self.is_edit else "New person", parent)

        self.type_combo = QComboBox()
        for person_type in PERSON_TYPES:
            self.type_combo.addItem(person_type.title(), person_type)
        if self.is_edit:
            self.type_combo.setCurrentText(str(person.get("personType", "")).title())
            self.type_combo.setEnabled(False)
        self.type_combo.currentIndexChanged.connect(self._on_type_changed)

        self.full_name_input = QLineEdit()
        self.preferred_name_input = QLineEdit()
        self.gender_combo = QComboBox()
        self.gender_combo.addItem("Not specified", None)
        for gender in ("Male", "Female", "Other"):
            self.gender_combo.addItem(gender, gender)
        self.dob_input = QLineEdit()
        self.dob_input.setPlaceholderText("YYYY-MM-DD (optional)")
        self.national_id_input = QLineEdit()
        self.national_id_input.setPlaceholderText("12-digit new NIC or 10-char old NIC")
        self.phone_primary_input = QLineEdit()
        self.phone_primary_input.setPlaceholderText("07XXXXXXXX or +947XXXXXXXX")
        self.phone_secondary_input = QLineEdit()
        self.email_input = QLineEdit()
        self.address1_input = QLineEdit()
        self.address2_input = QLineEdit()
        self.city_input = QLineEdit()
        self.district_input = QLineEdit()
        self.postal_input = QLineEdit()

        self.add_row("Person type *", self.type_combo)
        self.add_row("Full name *", self.full_name_input)
        self.add_row("Preferred name", self.preferred_name_input)
        self.add_row("Gender", self.gender_combo)
        self.add_row("Date of birth", self.dob_input)
        if not self.is_edit:
            self.add_row("National ID", self.national_id_input)
        self.add_row("Primary phone", self.phone_primary_input)
        self.add_row("Secondary phone", self.phone_secondary_input)
        self.add_row("Email", self.email_input)
        self.add_row("Address line 1", self.address1_input)
        self.add_row("Address line 2", self.address2_input)
        self.add_row("City", self.city_input)
        self.add_row("District", self.district_input)
        self.add_row("Postal code", self.postal_input)

        self.detail_stack = QStackedWidget()
        self.employee_page, self.employee_fields = self._build_employee_page()
        self.staff_page, self.staff_fields = self._build_staff_page()
        self.supplier_page, self.supplier_fields = self._build_supplier_page()
        self.admin_page, self.admin_fields = self._build_admin_page()
        for page in (
            self.employee_page,
            self.staff_page,
            self.supplier_page,
            self.admin_page,
        ):
            self.detail_stack.addWidget(page)

        self.add_section("Type-specific details")
        self.add_row("", self.detail_stack)

        self._populate()

    # ----------------------------------------------------------- form builders
    @staticmethod
    def _line(placeholder: str = "", text: Any = "") -> QLineEdit:
        widget = QLineEdit("" if text is None else str(text))
        widget.setPlaceholderText(placeholder)
        return widget

    @staticmethod
    def _combo(values: list[str], current: Any = None) -> QComboBox:
        combo = QComboBox()
        for value in values:
            combo.addItem(value.replace("_", " ").title(), value)
        if current:
            index = combo.findData(current)
            if index >= 0:
                combo.setCurrentIndex(index)
        return combo

    def _build_employee_page(self) -> tuple[QWidget, dict[str, QWidget]]:
        page = QWidget()
        form = QFormLayout(page)
        form.setContentsMargins(0, 0, 0, 0)
        fields = {
            "department": self._line("Required"),
            "designation": self._line("Required"),
            "employmentType": self._line("e.g. PERMANENT, CONTRACT"),
            "joinDate": self._line("YYYY-MM-DD"),
            "endDate": self._line("YYYY-MM-DD (optional)"),
            "epfNo": self._line("Optional"),
            "etfNo": self._line("Optional"),
            "wageType": self._combo(WAGE_TYPES),
            "baseRate": self._line("e.g. 1500.00"),
            "shiftId": self._line("Optional shift UUID"),
            "supervisorPersonId": self._line("Optional supervisor UUID"),
        }
        labels = {
            "department": "Department *",
            "designation": "Designation *",
            "employmentType": "Employment type *",
            "joinDate": "Join date *",
            "endDate": "End date",
            "epfNo": "EPF no",
            "etfNo": "ETF no",
            "wageType": "Wage type *",
            "baseRate": "Base rate *",
            "shiftId": "Shift ID",
            "supervisorPersonId": "Supervisor ID",
        }
        for key, widget in fields.items():
            form.addRow(labels[key], widget)
        return page, fields

    def _build_staff_page(self) -> tuple[QWidget, dict[str, QWidget]]:
        page = QWidget()
        form = QFormLayout(page)
        form.setContentsMargins(0, 0, 0, 0)
        fields = {
            "staffRole": self._combo(STAFF_ROLES),
            "designation": self._line("Required"),
            "joinDate": self._line("YYYY-MM-DD"),
            "endDate": self._line("YYYY-MM-DD (optional)"),
            "epfNo": self._line("Optional"),
            "etfNo": self._line("Optional"),
            "monthlySalary": self._line("e.g. 65000.00"),
            "drivingLicenceNo": self._line("Optional"),
            "licenceExpiry": self._line("YYYY-MM-DD (optional)"),
            "licenceClasses": self._line("Comma separated, e.g. B,C"),
        }
        labels = {
            "staffRole": "Staff role *",
            "designation": "Designation *",
            "joinDate": "Join date *",
            "endDate": "End date",
            "epfNo": "EPF no",
            "etfNo": "ETF no",
            "monthlySalary": "Monthly salary *",
            "drivingLicenceNo": "Driving licence no",
            "licenceExpiry": "Licence expiry",
            "licenceClasses": "Licence classes",
        }
        for key, widget in fields.items():
            form.addRow(labels[key], widget)
        return page, fields

    def _build_supplier_page(self) -> tuple[QWidget, dict[str, QWidget]]:
        page = QWidget()
        form = QFormLayout(page)
        form.setContentsMargins(0, 0, 0, 0)
        fields = {
            "businessName": self._line("Optional"),
            "businessRegNo": self._line("Optional"),
            "landAreaAcres": self._line("Optional, e.g. 2.5"),
            "estateName": self._line("Optional"),
            "collectionPoint": self._line("Optional"),
            "routeId": self._line("Optional route UUID"),
            "gpsLat": self._line("Optional, e.g. 6.9271"),
            "gpsLng": self._line("Optional, e.g. 79.8612"),
            "teaVariety": self._line("Optional"),
            "paymentMethod": self._combo(PAYMENT_METHODS),
            "smsOptIn": QCheckBox("Supplier consents to SMS"),
            "smsPhone": self._line("Optional"),
            "joinedOn": self._line("YYYY-MM-DD (optional)"),
            "contractRef": self._line("Optional"),
            "barcodeValue": self._line(
                "Optional; defaults to the generated supplier registration number"
            ),
        }
        labels = {
            "businessName": "Business name",
            "businessRegNo": "Business reg. no",
            "landAreaAcres": "Land area (acres)",
            "estateName": "Estate name",
            "collectionPoint": "Collection point",
            "routeId": "Route ID",
            "gpsLat": "GPS latitude",
            "gpsLng": "GPS longitude",
            "teaVariety": "Tea variety",
            "paymentMethod": "Payment method",
            "smsOptIn": "",
            "smsPhone": "SMS phone",
            "joinedOn": "Joined on",
            "contractRef": "Contract ref",
            "barcodeValue": "Barcode value",
        }
        for key, widget in fields.items():
            form.addRow(labels[key], widget)
        return page, fields

    def _build_admin_page(self) -> tuple[QWidget, dict[str, QWidget]]:
        page = QWidget()
        form = QFormLayout(page)
        form.setContentsMargins(0, 0, 0, 0)
        fields = {
            "adminLevel": self._line("Required, e.g. FACTORY, DEPARTMENT"),
            "department": self._line("Optional"),
        }
        form.addRow("Admin level *", fields["adminLevel"])
        form.addRow("Department", fields["department"])
        return page, fields

    # ------------------------------------------------------------------ state
    def _on_type_changed(self) -> None:
        mapping = {
            "EMPLOYEE": 0,
            "STAFF": 1,
            "SUPPLIER": 2,
            "ADMIN": 3,
        }
        self.detail_stack.setCurrentIndex(mapping.get(self.type_combo.currentData(), 0))

    def _populate(self) -> None:
        if not self.person:
            self._on_type_changed()
            return

        person = self.person
        self._on_type_changed()
        self.full_name_input.setText(str(person.get("fullName") or ""))
        self.preferred_name_input.setText(str(person.get("preferredName") or ""))
        gender = person.get("gender")
        index = self.gender_combo.findData(gender) if gender else 0
        self.gender_combo.setCurrentIndex(max(index, 0))
        self.dob_input.setText(_date_text(person.get("dateOfBirth")))
        self.phone_primary_input.setText(str(person.get("phonePrimary") or ""))
        self.phone_secondary_input.setText(str(person.get("phoneSecondary") or ""))
        self.email_input.setText(str(person.get("email") or ""))
        self.address1_input.setText(str(person.get("addressLine1") or ""))
        self.address2_input.setText(str(person.get("addressLine2") or ""))
        self.city_input.setText(str(person.get("city") or ""))
        self.district_input.setText(str(person.get("district") or ""))
        self.postal_input.setText(str(person.get("postalCode") or ""))

        detail_map = {
            "employeeDetails": self.employee_fields,
            "staffDetails": self.staff_fields,
            "supplierDetails": self.supplier_fields,
            "adminDetails": self.admin_fields,
        }
        for key, fields in detail_map.items():
            details = person.get(key) or {}
            for field, widget in fields.items():
                value = details.get(field)
                if isinstance(widget, QLineEdit):
                    if field in {"joinDate", "endDate", "licenceExpiry", "joinedOn"}:
                        widget.setText(_date_text(value))
                    else:
                        widget.setText("" if value is None else str(value))
                elif isinstance(widget, QComboBox) and value:
                    index = widget.findData(value)
                    if index >= 0:
                        widget.setCurrentIndex(index)
                elif isinstance(widget, QCheckBox):
                    widget.setChecked(bool(value))

    # --------------------------------------------------------------- validate
    def validate(self) -> str | None:
        if not self.full_name_input.text().strip():
            return "Full name is required."
        if not _valid_date(self.dob_input.text().strip()):
            return "Date of birth must be in YYYY-MM-DD format."

        person_type = self.type_combo.currentData()
        if person_type == "EMPLOYEE":
            if not self._text(self.employee_fields["department"]):
                return "Department is required for employees."
            if not self._text(self.employee_fields["designation"]):
                return "Designation is required for employees."
            if not self._text(self.employee_fields["employmentType"]):
                return "Employment type is required for employees."
            if not self._text(self.employee_fields["joinDate"]):
                return "Employee join date is required."
            if not _valid_date(self._text(self.employee_fields["joinDate"])):
                return "Employee join date must be YYYY-MM-DD."
            if not self._is_number(self._text(self.employee_fields["baseRate"])):
                return "Employee base rate must be a number."
        elif person_type == "STAFF":
            if not self._text(self.staff_fields["designation"]):
                return "Designation is required for staff."
            if not self._text(self.staff_fields["joinDate"]):
                return "Staff join date is required."
            if not _valid_date(self._text(self.staff_fields["joinDate"])):
                return "Staff join date must be YYYY-MM-DD."
            if not _valid_date(self._text(self.staff_fields["licenceExpiry"])):
                return "Licence expiry must be YYYY-MM-DD."
            if not self._is_number(self._text(self.staff_fields["monthlySalary"])):
                return "Monthly salary must be a number."
        elif person_type == "ADMIN" and not self._text(self.admin_fields["adminLevel"]):
            return "Admin level is required for admins."

        supplier_dates = ("joinedOn",)
        for field in supplier_dates:
            if not _valid_date(self._text(self.supplier_fields[field])):
                return "Supplier joined date must be YYYY-MM-DD."
        for field in ("landAreaAcres", "gpsLat", "gpsLng"):
            text = self._text(self.supplier_fields[field])
            if text and not self._is_number(text):
                return f"Supplier {field} must be a number."
        return None

    def _text(self, widget: QWidget) -> str:
        if isinstance(widget, QLineEdit):
            return widget.text().strip()
        return ""

    @staticmethod
    def _is_number(text: str) -> bool:
        if not text:
            return False
        try:
            float(text)
            return True
        except ValueError:
            return False

    # ----------------------------------------------------------------- collect
    def collect(self) -> dict[str, Any]:
        person_type = self.type_combo.currentData()
        payload: dict[str, Any] = {
            "fullName": self.full_name_input.text().strip(),
        }
        if not self.is_edit:
            payload["personType"] = person_type

        optional_text = {
            "preferredName": self.preferred_name_input,
            "dateOfBirth": self.dob_input,
            "phonePrimary": self.phone_primary_input,
            "phoneSecondary": self.phone_secondary_input,
            "email": self.email_input,
            "addressLine1": self.address1_input,
            "addressLine2": self.address2_input,
            "city": self.city_input,
            "district": self.district_input,
            "postalCode": self.postal_input,
        }
        for key, widget in optional_text.items():
            value = widget.text().strip()
            if value:
                payload[key] = value

        if not self.is_edit:
            national_id = self.national_id_input.text().strip()
            if national_id:
                payload["nationalId"] = national_id

        gender = self.gender_combo.currentData()
        if gender:
            payload["gender"] = gender

        details_key, fields = {
            "EMPLOYEE": ("employeeDetails", self.employee_fields),
            "STAFF": ("staffDetails", self.staff_fields),
            "SUPPLIER": ("supplierDetails", self.supplier_fields),
            "ADMIN": ("adminDetails", self.admin_fields),
        }[person_type]

        payload[details_key] = self._collect_fields(fields)
        return payload

    def _collect_fields(self, fields: dict[str, QWidget]) -> dict[str, Any]:
        details: dict[str, Any] = {}
        numeric = {
            "baseRate",
            "monthlySalary",
            "landAreaAcres",
            "gpsLat",
            "gpsLng",
        }
        dates = {"joinDate", "endDate", "licenceExpiry", "joinedOn"}
        for key, widget in fields.items():
            if isinstance(widget, QLineEdit):
                value = widget.text().strip()
                if not value:
                    continue
                if key in numeric:
                    try:
                        details[key] = float(value)
                    except ValueError:
                        continue
                elif key == "licenceClasses":
                    details[key] = [
                        part.strip() for part in value.split(",") if part.strip()
                    ]
                elif key in dates:
                    details[key] = value
                else:
                    details[key] = value
            elif isinstance(widget, QComboBox):
                value = widget.currentData()
                if value:
                    details[key] = value
            elif isinstance(widget, QCheckBox):
                details[key] = widget.isChecked()
        return details
