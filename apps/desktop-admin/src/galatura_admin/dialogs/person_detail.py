"""Person detail, bank account, document, consent and barcode dialogs."""

from __future__ import annotations

import os
from typing import Any

import requests
from galatura_desktop_core import ApiError, SessionManager, human_error
from galatura_desktop_core.idle_lock import sensitive_screen
from galatura_desktop_core.widgets import (
    DataTable,
    FormDialog,
    StatusBanner,
    confirm,
    danger_button,
    format_bool,
    format_date,
    format_datetime,
    ghost_button,
    primary_button,
    run_async,
    title_case,
)
from PySide6.QtCore import QByteArray, QRectF, Qt
from PySide6.QtGui import QPainter
from PySide6.QtPrintSupport import QPrintDialog, QPrinter
from PySide6.QtSvg import QSvgRenderer
from PySide6.QtSvgWidgets import QSvgWidget
from PySide6.QtWidgets import (
    QCheckBox,
    QComboBox,
    QDialog,
    QFileDialog,
    QFormLayout,
    QHBoxLayout,
    QLabel,
    QLineEdit,
    QScrollArea,
    QTabWidget,
    QVBoxLayout,
    QWidget,
)

from .person_form import PersonFormDialog

PERSON_STATUSES = ["ACTIVE", "INACTIVE", "SUSPENDED", "TERMINATED"]
DOCUMENT_TYPES = ["NIC_FRONT", "NIC_BACK", "LICENCE", "CONTRACT", "PHOTO"]
CONSENT_TYPES = ["BIOMETRIC", "SMS", "DATA_PROCESSING"]


class BankAccountDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None):
        super().__init__("Add bank account", parent)
        self.bank_name = QLineEdit()
        self.bank_code = QLineEdit()
        self.branch_name = QLineEdit()
        self.branch_code = QLineEdit()
        self.holder_name = QLineEdit()
        self.account_number = QLineEdit()
        self.is_primary = QCheckBox("Set as the primary payout account")
        self.is_primary.setChecked(True)

        self.add_row("Bank name *", self.bank_name)
        self.add_row("Bank code", self.bank_code)
        self.add_row("Branch name", self.branch_name)
        self.add_row("Branch code", self.branch_code)
        self.add_row("Account holder *", self.holder_name)
        self.add_row("Account number *", self.account_number)
        self.add_row("", self.is_primary)

    def validate(self) -> str | None:
        if not self.bank_name.text().strip():
            return "Bank name is required."
        if not self.holder_name.text().strip():
            return "Account holder name is required."
        if not self.account_number.text().strip():
            return "Account number is required."
        return None

    def collect(self) -> dict[str, Any]:
        return {
            "bankName": self.bank_name.text().strip(),
            "bankCode": self.bank_code.text().strip() or None,
            "branchName": self.branch_name.text().strip() or None,
            "branchCode": self.branch_code.text().strip() or None,
            "accountHolderName": self.holder_name.text().strip(),
            "accountNumber": self.account_number.text().strip(),
            "isPrimary": self.is_primary.isChecked(),
        }


class DocumentDialog(FormDialog):
    def __init__(
        self, session: SessionManager, person_id: str, parent: QWidget | None = None
    ):
        super().__init__("Add document", parent)
        self.session = session
        self.person_id = person_id

        self.doc_type = QComboBox()
        for doc_type in DOCUMENT_TYPES:
            self.doc_type.addItem(doc_type.replace("_", " ").title(), doc_type)
        self.object_key = QLineEdit()
        self.object_key.setPlaceholderText("Storage object key")
        self.mime = QLineEdit()
        self.mime.setPlaceholderText("e.g. image/jpeg")
        self.size = QLineEdit()
        self.size.setPlaceholderText("Size in bytes")
        self.expires_on = QLineEdit()
        self.expires_on.setPlaceholderText("YYYY-MM-DD (optional)")

        self.add_row("Document type *", self.doc_type)
        self.add_row("Object key *", self.object_key)
        self.add_row("MIME type *", self.mime)
        self.add_row("Size (bytes) *", self.size)
        self.add_row("Expires on", self.expires_on)

        choose = ghost_button("Choose file and upload...")
        choose.clicked.connect(self._choose_file)
        self.add_row("", choose)

        self.upload_banner = StatusBanner()
        self.add_row("", self.upload_banner)

        self._resolved: dict[str, Any] | None = None

    def _choose_file(self) -> None:
        path, _ = QFileDialog.getOpenFileName(self, "Choose document")
        if not path:
            return
        filename = os.path.basename(path)
        mime = self.mime.text().strip() or "application/octet-stream"
        self.upload_banner.show_info("Preparing upload...")
        run_async(
            lambda: self.session.people.document_upload_url(
                self.person_id, filename, mime
            ),
            lambda url_info: self._upload(path, url_info),
            self._upload_error,
        )

    def _upload(self, path: str, url_info: dict[str, Any]) -> None:
        object_key = (url_info or {}).get("objectKey", "")
        upload_url = (url_info or {}).get("uploadUrl", "")
        mime = (url_info or {}).get("mime") or "application/octet-stream"
        self.object_key.setText(object_key)
        self.mime.setText(mime)
        self.size.setText(str(os.path.getsize(path)))

        if not upload_url:
            self.upload_banner.show_info(
                "No upload URL was returned; only the metadata will be recorded."
            )
            return

        self.upload_banner.show_info("Uploading...")
        run_async(
            lambda: self._put_file(path, upload_url, mime),
            self._upload_finished,
            self._upload_error,
        )

    @staticmethod
    def _put_file(path: str, upload_url: str, mime: str) -> bool:
        with open(path, "rb") as handle:
            response = requests.put(
                upload_url,
                data=handle,
                headers={"Content-Type": mime},
                timeout=60,
            )
        response.raise_for_status()
        return True

    def _upload_finished(self, _result: Any) -> None:
        self.upload_banner.show_success("File uploaded. Click OK to save the record.")

    def _upload_error(self, error: BaseException) -> None:
        self.upload_banner.show_error(
            "Upload failed; file storage may not be configured yet. "
            "The metadata can still be recorded. " + human_error(error)
        )

    def validate(self) -> str | None:
        if not self.object_key.text().strip():
            return "Object key is required."
        if not self.mime.text().strip():
            return "MIME type is required."
        try:
            int(self.size.text().strip())
        except ValueError:
            return "Size must be a whole number of bytes."
        return None

    def collect(self) -> dict[str, Any]:
        return {
            "docType": self.doc_type.currentData(),
            "objectKey": self.object_key.text().strip(),
            "mime": self.mime.text().strip(),
            "sizeBytes": int(self.size.text().strip()),
            "expiresOn": self.expires_on.text().strip() or None,
        }


class ConsentDialog(FormDialog):
    def __init__(self, parent: QWidget | None = None):
        super().__init__("Record consent", parent)
        self.consent_type = QComboBox()
        for consent_type in CONSENT_TYPES:
            self.consent_type.addItem(
                consent_type.replace("_", " ").title(), consent_type
            )
        self.granted = QCheckBox("Consent granted")
        self.granted.setChecked(True)
        self.evidence = QLineEdit()
        self.evidence.setPlaceholderText("Optional evidence object key")

        self.add_row("Consent type", self.consent_type)
        self.add_row("", self.granted)
        self.add_row("Evidence", self.evidence)

    def collect(self) -> dict[str, Any]:
        return {
            "consentType": self.consent_type.currentData(),
            "granted": self.granted.isChecked(),
            "evidenceObjectKey": self.evidence.text().strip() or None,
        }


class BarcodeCardDialog(QDialog):
    def __init__(
        self, session: SessionManager, person_id: str, parent: QWidget | None = None
    ):
        super().__init__(parent)
        self.session = session
        self.person_id = person_id
        self.card: dict[str, Any] = {}
        self.setWindowTitle("Supplier barcode card")
        self.setMinimumSize(560, 620)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 24, 24, 24)
        layout.setSpacing(12)

        self.title = QLabel("Loading supplier card...")
        self.title.setObjectName("Title")
        layout.addWidget(self.title)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        self.details = QLabel("")
        self.details.setObjectName("Subtitle")
        self.details.setWordWrap(True)
        layout.addWidget(self.details)

        self.barcode = QSvgWidget()
        self.barcode.setFixedHeight(110)
        layout.addWidget(self.barcode)

        self.qr = QSvgWidget()
        self.qr.setFixedHeight(150)
        layout.addWidget(self.qr)

        actions = QHBoxLayout()
        actions.addStretch(1)
        self.print_button = primary_button("Print")
        self.print_button.setEnabled(False)
        self.print_button.clicked.connect(self._print)
        close = ghost_button("Close")
        close.clicked.connect(self.accept)
        actions.addWidget(self.print_button)
        actions.addWidget(close)
        layout.addLayout(actions)

        run_async(
            lambda: self.session.people.supplier_barcode_card(person_id),
            self._apply,
            self._on_error,
        )

    def _apply(self, card: dict[str, Any]) -> None:
        self.card = card or {}
        self.title.setText(card.get("fullName") or "Supplier")
        parts = [
            f"Code: {card.get('supplierCode', '-')}",
            f"Registration no: {card.get('supplierRegNo', '-')}",
            f"Barcode: {card.get('barcodeValue', '-')}",
        ]
        if card.get("estateName"):
            parts.append(f"Estate: {card['estateName']}")
        if card.get("collectionPoint"):
            parts.append(f"Collection point: {card['collectionPoint']}")
        self.details.setText("   |   ".join(parts))

        self.barcode.load(QByteArray(str(card.get("svgBarcode") or "").encode("utf-8")))
        self.qr.load(QByteArray(str(card.get("svgQr") or "").encode("utf-8")))
        self.print_button.setEnabled(True)

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))

    def _print(self) -> None:
        if not self.card:
            return
        printer = QPrinter(QPrinter.PrinterMode.HighResolution)
        dialog = QPrintDialog(printer, self)
        if dialog.exec() != QDialog.DialogCode.Accepted:
            return

        painter = QPainter(printer)
        try:
            rect = painter.viewport()
            margin = 40
            width = rect.width()
            top = rect.y() + margin

            painter.drawText(
                QRectF(rect.x(), top, width, 40),
                Qt.AlignmentFlag.AlignHCenter,
                str(self.card.get("fullName") or "Supplier"),
            )
            top += 44
            painter.drawText(
                QRectF(rect.x(), top, width, 30),
                Qt.AlignmentFlag.AlignHCenter,
                f"{self.card.get('supplierRegNo', '')}  |  "
                f"{self.card.get('supplierCode', '')}",
            )
            top += 40

            barcode_renderer = QSvgRenderer(
                QByteArray(str(self.card.get("svgBarcode") or "").encode("utf-8"))
            )
            barcode_rect = QRectF(rect.x() + margin, top, width - margin * 2, 120)
            barcode_renderer.render(painter, barcode_rect)
            top += 150

            qr_size = min(240.0, width - margin * 2)
            qr_rect = QRectF(rect.x() + (width - qr_size) / 2, top, qr_size, qr_size)
            qr_renderer = QSvgRenderer(
                QByteArray(str(self.card.get("svgQr") or "").encode("utf-8"))
            )
            qr_renderer.render(painter, qr_rect)
        finally:
            painter.end()


class PersonDetailDialog(QDialog):
    def __init__(
        self, session: SessionManager, person_id: str, parent: QWidget | None = None
    ):
        super().__init__(parent)
        self.session = session
        self.person_id = person_id
        self.person: dict[str, Any] = {}
        self._banks: list[dict[str, Any]] = []
        self._documents: list[dict[str, Any]] = []
        self._consents: list[dict[str, Any]] = []

        self.setWindowTitle("Person details")
        self.setMinimumSize(940, 680)

        layout = QVBoxLayout(self)
        layout.setContentsMargins(24, 20, 24, 20)
        layout.setSpacing(12)

        header = QHBoxLayout()
        self.title = QLabel("Loading...")
        self.title.setObjectName("Title")
        self.subtitle = QLabel("")
        self.subtitle.setObjectName("Subtitle")
        title_box = QVBoxLayout()
        title_box.setSpacing(2)
        title_box.addWidget(self.title)
        title_box.addWidget(self.subtitle)
        header.addLayout(title_box, 1)

        self.edit_button = ghost_button("Edit")
        self.edit_button.clicked.connect(self._edit_person)
        self.barcode_button = ghost_button("Barcode card")
        self.barcode_button.setVisible(False)
        self.barcode_button.clicked.connect(self._show_barcode)
        close = ghost_button("Close")
        close.clicked.connect(self.accept)
        header.addWidget(self.edit_button)
        header.addWidget(self.barcode_button)
        header.addWidget(close)
        layout.addLayout(header)

        status_row = QHBoxLayout()
        status_row.addWidget(QLabel("Status"))
        self.status_combo = QComboBox()
        self.status_combo.addItems(PERSON_STATUSES)
        self.status_button = primary_button("Update status")
        self.status_button.clicked.connect(self._update_status)
        status_row.addWidget(self.status_combo)
        status_row.addWidget(self.status_button)
        status_row.addStretch(1)
        layout.addLayout(status_row)

        self.banner = StatusBanner()
        layout.addWidget(self.banner)

        self.tabs = QTabWidget()
        layout.addWidget(self.tabs, 1)

        # ------------------------------------------------------------- profile
        self.profile_scroll = QScrollArea()
        self.profile_scroll.setWidgetResizable(True)
        self.profile_container = QWidget()
        self.profile_form = QFormLayout(self.profile_container)
        self.profile_form.setContentsMargins(16, 16, 16, 16)
        self.profile_form.setHorizontalSpacing(20)
        self.profile_form.setVerticalSpacing(9)
        self.profile_scroll.setWidget(self.profile_container)
        self.tabs.addTab(self.profile_scroll, "Profile")

        # -------------------------------------------------------------- banks
        banks_tab = QWidget()
        banks_layout = QVBoxLayout(banks_tab)
        banks_layout.setContentsMargins(10, 10, 10, 10)
        self.banks_table = DataTable(
            [
                ("bankName", "Bank", 160),
                ("branchName", "Branch", 140),
                ("accountNumber", "Account", 140),
                ("accountHolderName", "Holder", 170),
                ("isPrimary", "Primary", 70),
                ("status", "Status", 110),
                ("verifiedAt_text", "Verified", 130),
            ]
        )
        self.banks_table.itemSelectionChanged.connect(self._update_bank_actions)
        banks_layout.addWidget(self.banks_table, 1)
        bank_actions = QHBoxLayout()
        bank_actions.addStretch(1)
        self.bank_add = primary_button("Add account")
        self.bank_add.clicked.connect(self._add_bank)
        self.bank_primary = ghost_button("Set primary")
        self.bank_primary.clicked.connect(self._set_primary_bank)
        self.bank_verify = ghost_button("Verify")
        self.bank_verify.clicked.connect(self._verify_bank)
        self.bank_delete = danger_button("Delete")
        self.bank_delete.clicked.connect(self._delete_bank)
        for button in (
            self.bank_add,
            self.bank_primary,
            self.bank_verify,
            self.bank_delete,
        ):
            bank_actions.addWidget(button)
        banks_layout.addLayout(bank_actions)
        self.tabs.addTab(banks_tab, "Bank accounts")

        # ---------------------------------------------------------- documents
        documents_tab = QWidget()
        documents_layout = QVBoxLayout(documents_tab)
        documents_layout.setContentsMargins(10, 10, 10, 10)
        self.documents_table = DataTable(
            [
                ("docType", "Type", 110),
                ("mime", "MIME", 130),
                ("objectKey", "Object key", 300),
                ("sizeBytes", "Size", 90),
                ("expiresOn_text", "Expires", 100),
                ("createdAt_text", "Added", 130),
            ]
        )
        self.documents_table.itemSelectionChanged.connect(self._update_document_actions)
        documents_layout.addWidget(self.documents_table, 1)
        document_actions = QHBoxLayout()
        document_actions.addStretch(1)
        self.document_add = primary_button("Add document")
        self.document_add.clicked.connect(self._add_document)
        self.document_delete = danger_button("Delete")
        self.document_delete.clicked.connect(self._delete_document)
        document_actions.addWidget(self.document_add)
        document_actions.addWidget(self.document_delete)
        documents_layout.addLayout(document_actions)
        self.tabs.addTab(documents_tab, "Documents")

        # ------------------------------------------------------------ consents
        consents_tab = QWidget()
        consents_layout = QVBoxLayout(consents_tab)
        consents_layout.setContentsMargins(10, 10, 10, 10)
        self.consents_table = DataTable(
            [
                ("consentType", "Consent", 160),
                ("granted", "Granted", 80),
                ("grantedAt_text", "Granted at", 140),
                ("revokedAt_text", "Revoked at", 140),
                ("evidenceObjectKey", "Evidence", 260),
            ]
        )
        consents_layout.addWidget(self.consents_table, 1)
        consent_actions = QHBoxLayout()
        consent_actions.addStretch(1)
        record_consent = primary_button("Record consent")
        record_consent.clicked.connect(self._record_consent)
        consent_actions.addWidget(record_consent)
        consents_layout.addLayout(consent_actions)
        self.tabs.addTab(consents_tab, "Consents")

        self._update_bank_actions()
        self._update_document_actions()
        run_async(self._load, self._apply, self._on_error)

    # ------------------------------------------------------------------ load
    def _load(self) -> dict[str, Any]:
        result: dict[str, Any] = {"errors": []}
        result["person"] = self.session.people.get_person(self.person_id)

        for key, loader in (
            ("banks", self.session.people.list_bank_accounts),
            ("documents", self.session.people.list_documents),
            ("consents", self.session.people.list_consents),
        ):
            try:
                result[key] = loader(self.person_id) or []
            except ApiError as exc:
                result[key] = []
                result["errors"].append(f"{key}: {exc}")
        return result

    def _apply(self, data: dict[str, Any]) -> None:
        person = data.get("person") or {}
        self.person = person
        self.title.setText(person.get("fullName") or "Person")
        self.subtitle.setText(
            f"{person.get('code', '-')}  |  {title_case(person.get('personType'))}  |  "
            f"{title_case(person.get('status'))}"
        )
        status = str(person.get("status") or "ACTIVE")
        if status in PERSON_STATUSES:
            self.status_combo.setCurrentText(status)
        self.barcode_button.setVisible(person.get("personType") == "SUPPLIER")
        self._render_profile(person)

        self._banks = data.get("banks") or []
        self._documents = data.get("documents") or []
        self._consents = data.get("consents") or []
        self._render_banks()
        self._render_documents()
        self._render_consents()

        if data.get("errors"):
            self.banner.show_info(
                "Some sections could not be loaded: " + "; ".join(data["errors"])
            )

    def _on_error(self, error: BaseException) -> None:
        self.banner.show_error(human_error(error))

    # --------------------------------------------------------------- profile
    def _render_profile(self, person: dict[str, Any]) -> None:
        while self.profile_form.rowCount():
            self.profile_form.removeRow(0)

        rows = [
            ("Code", person.get("code")),
            ("Type", title_case(person.get("personType"))),
            ("Status", title_case(person.get("status"))),
            ("Full name", person.get("fullName")),
            ("Preferred name", person.get("preferredName")),
            ("Gender", person.get("gender")),
            ("Date of birth", format_date(person.get("dateOfBirth"))),
            ("National ID", person.get("nationalId")),
            ("Primary phone", person.get("phonePrimary")),
            ("Secondary phone", person.get("phoneSecondary")),
            ("Email", person.get("email")),
            (
                "Address",
                " ".join(
                    str(value)
                    for value in (
                        person.get("addressLine1"),
                        person.get("addressLine2"),
                        person.get("city"),
                        person.get("district"),
                        person.get("postalCode"),
                    )
                    if value
                ),
            ),
            ("Created", format_datetime(person.get("createdAt"))),
            ("Updated", format_datetime(person.get("updatedAt"))),
        ]

        details = (
            person.get("employeeDetails")
            or person.get("staffDetails")
            or person.get("supplierDetails")
            or person.get("adminDetails")
            or {}
        )
        for key, value in details.items():
            if key in {
                "id",
                "personId",
                "createdAt",
                "updatedAt",
                "supplierRegNoNormalized",
            }:
                continue
            rows.append((title_case(key), value))

        for label, value in rows:
            field = QLabel("" if value is None else str(value))
            field.setTextInteractionFlags(Qt.TextInteractionFlag.TextSelectableByMouse)
            field.setWordWrap(True)
            self.profile_form.addRow(label, field)

    def _edit_person(self) -> None:
        if not self.person:
            return
        dialog = PersonFormDialog(self.person, self)
        if not dialog.exec():
            return
        payload = dialog.payload
        run_async(
            lambda: self.session.people.update_person(self.person_id, payload),
            self._after_person_change("Person updated."),
            self._on_error,
        )

    def _update_status(self) -> None:
        status = self.status_combo.currentText()
        if status == str(self.person.get("status")):
            return
        run_async(
            lambda: self.session.people.update_status(self.person_id, status),
            self._after_person_change(f"Status changed to {status}."),
            self._on_error,
        )

    def _after_person_change(self, message: str):
        def handler(_result: Any) -> None:
            self.banner.show_success(message)
            self._reload()

        return handler

    def _reload(self) -> None:
        run_async(self._load, self._apply, self._on_error)

    def _show_barcode(self) -> None:
        dialog = BarcodeCardDialog(self.session, self.person_id, self)
        dialog.exec()

    # ----------------------------------------------------------------- banks
    def _render_banks(self) -> None:
        rows = []
        for account in self._banks:
            rows.append(
                {
                    **account,
                    "isPrimary": format_bool(account.get("isPrimary")),
                    "verifiedAt_text": format_datetime(account.get("verifiedAt")),
                }
            )
        self.banks_table.set_rows(rows)
        self._update_bank_actions()

    def _selected_bank(self) -> dict[str, Any] | None:
        return self.banks_table.selected_row()

    def _update_bank_actions(self) -> None:
        account = self._selected_bank()
        enabled = account is not None
        for button in (self.bank_primary, self.bank_verify, self.bank_delete):
            button.setEnabled(enabled)
        if account is not None:
            self.bank_verify.setEnabled(str(account.get("status")) != "VERIFIED")

    def _reload_banks(self) -> None:
        run_async(
            lambda: self.session.people.list_bank_accounts(self.person_id),
            self._apply_banks,
            self._on_error,
        )

    def _apply_banks(self, banks: list[dict[str, Any]]) -> None:
        self._banks = banks or []
        self._render_banks()

    def _add_bank(self) -> None:
        dialog = BankAccountDialog(self)
        with sensitive_screen():
            accepted = dialog.exec()
        if not accepted:
            return
        payload = dialog.payload
        run_async(
            lambda: self.session.people.add_bank_account(self.person_id, payload),
            self._after_bank_change(
                "Bank account added. A different administrator must verify it."
            ),
            self._on_error,
        )

    def _set_primary_bank(self) -> None:
        account = self._selected_bank()
        if not account:
            return
        run_async(
            lambda: self.session.people.set_primary_bank_account(
                self.person_id, account["id"]
            ),
            self._after_bank_change("Primary account updated."),
            self._on_error,
        )

    def _verify_bank(self) -> None:
        account = self._selected_bank()
        if not account:
            return
        if not confirm(
            self,
            "Verify bank account",
            f"Mark {account.get('bankName')} ******{account.get('accountLast4')} as verified?",
        ):
            return
        run_async(
            lambda: self.session.people.verify_bank_account(account["id"]),
            self._after_bank_change("Bank account verified."),
            self._on_error,
        )

    def _delete_bank(self) -> None:
        account = self._selected_bank()
        if not account:
            return
        if not confirm(self, "Delete bank account", "Delete this bank account?"):
            return
        run_async(
            lambda: self.session.people.delete_bank_account(
                self.person_id, account["id"]
            ),
            self._after_bank_change("Bank account deleted."),
            self._on_error,
        )

    def _after_bank_change(self, message: str):
        def handler(_result: Any) -> None:
            self.banner.show_success(message)
            self._reload_banks()

        return handler

    # ------------------------------------------------------------- documents
    def _render_documents(self) -> None:
        rows = []
        for document in self._documents:
            rows.append(
                {
                    **document,
                    "expiresOn_text": format_date(document.get("expiresOn")),
                    "createdAt_text": format_datetime(document.get("createdAt")),
                }
            )
        self.documents_table.set_rows(rows)
        self._update_document_actions()

    def _selected_document(self) -> dict[str, Any] | None:
        return self.documents_table.selected_row()

    def _update_document_actions(self) -> None:
        self.document_delete.setEnabled(self._selected_document() is not None)

    def _reload_documents(self) -> None:
        run_async(
            lambda: self.session.people.list_documents(self.person_id),
            self._apply_documents,
            self._on_error,
        )

    def _apply_documents(self, documents: list[dict[str, Any]]) -> None:
        self._documents = documents or []
        self._render_documents()

    def _add_document(self) -> None:
        dialog = DocumentDialog(self.session, self.person_id, self)
        if not dialog.exec():
            return
        payload = dialog.payload
        run_async(
            lambda: self.session.people.add_document(self.person_id, payload),
            self._after_document_change("Document record saved."),
            self._on_error,
        )

    def _delete_document(self) -> None:
        document = self._selected_document()
        if not document:
            return
        if not confirm(self, "Delete document", "Delete this document record?"):
            return
        run_async(
            lambda: self.session.people.delete_document(self.person_id, document["id"]),
            self._after_document_change("Document deleted."),
            self._on_error,
        )

    def _after_document_change(self, message: str):
        def handler(_result: Any) -> None:
            self.banner.show_success(message)
            self._reload_documents()

        return handler

    # -------------------------------------------------------------- consents
    def _render_consents(self) -> None:
        rows = []
        for consent in self._consents:
            rows.append(
                {
                    **consent,
                    "granted": format_bool(consent.get("granted")),
                    "grantedAt_text": format_datetime(consent.get("grantedAt")),
                    "revokedAt_text": format_datetime(consent.get("revokedAt")),
                }
            )
        self.consents_table.set_rows(rows)

    def _reload_consents(self) -> None:
        run_async(
            lambda: self.session.people.list_consents(self.person_id),
            self._apply_consents,
            self._on_error,
        )

    def _apply_consents(self, consents: list[dict[str, Any]]) -> None:
        self._consents = consents or []
        self._render_consents()

    def _record_consent(self) -> None:
        dialog = ConsentDialog(self)
        if not dialog.exec():
            return
        payload = dialog.payload
        run_async(
            lambda: self.session.people.record_consent(self.person_id, payload),
            self._after_consent_change("Consent recorded."),
            self._on_error,
        )

    def _after_consent_change(self, message: str):
        def handler(_result: Any) -> None:
            self.banner.show_success(message)
            self._reload_consents()

        return handler
