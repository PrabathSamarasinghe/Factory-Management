"""Small language catalog and selector shared by desktop apps."""

from __future__ import annotations

from typing import Any

from PySide6.QtCore import QObject, Signal
from PySide6.QtWidgets import QComboBox, QWidget

from .settings import DesktopSettings

DEFAULT_LANGUAGE = "en"
SUPPORTED_LANGUAGES = (
    ("en", "English"),
    ("si", "සිංහල"),
    ("ta", "தமிழ்"),
)

CATALOGS: dict[str, dict[str, str]] = {
    "en": {
        "app.admin": "Galatura Admin Console",
        "app.inventory": "Galatura Inventory",
        "product.admin": "Admin Console",
        "product.inventory": "Inventory",
        "nav.dashboard": "Dashboard",
        "nav.people": "People & Suppliers",
        "nav.users": "Users",
        "nav.roles": "Roles & Permissions",
        "nav.lorries": "Fleet Lorries",
        "nav.routes": "Fleet Routes",
        "nav.assignments": "Fleet Assignments",
        "nav.audit": "Audit Log",
        "nav.items": "Items",
        "nav.receipts": "Receipts",
        "nav.issues": "Issues",
        "nav.transfers": "Transfers",
        "nav.adjustments": "Adjustments",
        "nav.stock_takes": "Stock Takes",
        "nav.stock": "Stock",
        "action.sign_out": "Sign out",
        "action.my_account": "My account",
        "action.change_now": "Change now",
        "action.refresh": "Refresh",
        "status.ready": "Ready",
        "status.no_roles": "No roles",
        "status.live_connected": "Live: connected",
        "status.live_disconnected": "Live: disconnected",
        "status.live_unavailable": "Live: unavailable",
        "status.data_changed": "Data changed - refresh",
        "language.label": "Language",
        "password.warning": "Your account requires a password change before you continue.",
        "signin.title": "Sign in",
        "signin.subtitle.admin": "Sign in to manage people, users and permissions.",
        "signin.subtitle.inventory": "Sign in to receive stock, issue materials and view balances.",
        "signin.username": "Username or email",
        "signin.password": "Password",
        "signin.show_password": "Show password",
        "signin.footer.admin": "Access is monitored and recorded in the audit log.",
        "signin.footer.inventory": "Receipts and approvals are attributed to your account.",
        "lock.idle": "Session locked after inactivity.",
        "lock.sensitive": "Session locked on a sensitive screen.",
    },
    "si": {
        "app.admin": "ගැලටුරා පරිපාලක කොන්සෝලය",
        "app.inventory": "ගැලටුරා ඉන්වෙන්ටරි",
        "product.admin": "පරිපාලක කොන්සෝලය",
        "product.inventory": "ඉන්වෙන්ටරි",
        "nav.dashboard": "දින සාරාංශය",
        "nav.people": "පුද්ගලයන් සහ සැපයුම්කරුවන්",
        "nav.users": "පරිශීලකයන්",
        "nav.roles": "භූමිකා සහ අවසර",
        "nav.lorries": "වාහන ලොරි",
        "nav.routes": "මාර්ග",
        "nav.assignments": "වාහන වෙන්කිරීම්",
        "nav.audit": "විගණන ලොගය",
        "nav.items": "භාණ්ඩ",
        "nav.receipts": "ග්‍රහණ",
        "nav.issues": "නිකුත් කිරීම්",
        "nav.transfers": "මාරුවීම්",
        "nav.adjustments": "ගැලපීම්",
        "nav.stock_takes": "තොග ගණන්",
        "nav.stock": "තොගය",
        "action.sign_out": "විතැන් වන්න",
        "action.my_account": "මගේ ගිණුම",
        "action.change_now": "දැන් වෙනස් කරන්න",
        "action.refresh": "නැවුම් කරන්න",
        "status.ready": "සූදානම්",
        "status.no_roles": "භූමිකා නැත",
        "status.live_connected": "සජීවී: සම්බන්ධයි",
        "status.live_disconnected": "සජීවී: විසන්ධියි",
        "status.live_unavailable": "සජීවී: නොමැත",
        "status.data_changed": "දත්ත වෙනස් වී ඇත - නැවුම් කරන්න",
        "language.label": "භාෂාව",
        "password.warning": "ඉදිරියට යාමට පෙර ඔබගේ ගිණුමේ මුරපදය වෙනස් කළ යුතුය.",
        "signin.title": "පුරනය වන්න",
        "signin.subtitle.admin": "පුද්ගලයන්, පරිශීලකයන් සහ අවසර කළමනාකරණය කිරීමට පුරනය වන්න.",
        "signin.subtitle.inventory": (
            "තොග ලබාගැනීම, ද්‍රව්‍ය නිකුත් කිරීම සහ ශේෂ බැලීමට පුරනය වන්න."
        ),
        "signin.username": "පරිශීලක නාමය හෝ විද්‍යුත් තැපෑල",
        "signin.password": "මුරපදය",
        "signin.show_password": "මුරපදය පෙන්වන්න",
        "signin.footer.admin": "ප්‍රවේශය නිරීක්ෂණය කර විගණන ලොගයේ සටහන් කරයි.",
        "signin.footer.inventory": "ග්‍රහණ සහ අනුමැතිය ඔබගේ ගිණුමට අයත් වේ.",
        "lock.idle": "අක්‍රියතාවයෙන් පසු සැසිය අගුළු දමා ඇත.",
        "lock.sensitive": "සංවේදී තිරයකදී සැසිය අගුළු දමා ඇත.",
    },
    "ta": {
        "app.admin": "கலடூரா நிர்வாகக் கட்டுப்பாட்டகம்",
        "app.inventory": "கலடூரா இருப்பு மேலாண்மை",
        "product.admin": "நிர்வாகக் கட்டுப்பாட்டகம்",
        "product.inventory": "இருப்பு மேலாண்மை",
        "nav.dashboard": "நாள் சுருக்கம்",
        "nav.people": "நபர்கள் மற்றும் சப்ளையர்கள்",
        "nav.users": "பயனர்கள்",
        "nav.roles": "பாத்திரங்கள் மற்றும் அனுமதிகள்",
        "nav.lorries": "வாகன லாரிகள்",
        "nav.routes": "வழித்தடங்கள்",
        "nav.assignments": "வாகන ஒதுக்கீடுகள்",
        "nav.audit": "தணிக்கைப் பதிவு",
        "nav.items": "பொருட்கள்",
        "nav.receipts": "ரசீதுகள்",
        "nav.issues": "வழங்கல்கள்",
        "nav.transfers": "மாற்றங்கள்",
        "nav.adjustments": "சரிசெய்தல்கள்",
        "nav.stock_takes": "இருப்பு எண்ணிக்கை",
        "nav.stock": "இருப்பு",
        "action.sign_out": "வெளியேறு",
        "action.my_account": "என் கணக்கு",
        "action.change_now": "இப்போது மாற்று",
        "action.refresh": "புதுப்பி",
        "status.ready": "தயார்",
        "status.no_roles": "பாத்திரங்கள் இல்லை",
        "status.live_connected": "நேரடி: இணைக்கப்பட்டது",
        "status.live_disconnected": "நேரடி: துண்டிக்கப்பட்டது",
        "status.live_unavailable": "நேரடி: கிடைக்கவில்லை",
        "status.data_changed": "தரவு மாறியது - புதுப்பிக்க",
        "language.label": "மொழி",
        "password.warning": "தொடருவதற்கு முன் உங்கள் கணக்கின் கடவுச்சொல்லை மாற்ற வேண்டும்.",
        "signin.title": "உள்நுழைய",
        "signin.subtitle.admin": "நபர்கள், பயனர்கள் மற்றும் அனுமதிகளை நிர்வகிக்க உள்நுழையவும்.",
        "signin.subtitle.inventory": (
            "இருப்பு பெறுதல், பொருட்கள் வழங்குதல் மற்றும் இருப்பு காண உள்நுழையவும்."
        ),
        "signin.username": "பயனர்பெயர் அல்லது மின்னஞ்சல்",
        "signin.password": "கடவுச்சொல்",
        "signin.show_password": "கடவுச்சொல்லைக் காட்டு",
        "signin.footer.admin": "அணுகல் கண்காணிக்கப்பட்டு தணிக்கைப் பதிவில் சேமிக்கப்படுகிறது.",
        "signin.footer.inventory": "ரசீதுகள் மற்றும் அனுமதிகள் உங்கள் கணக்கிற்கு பதிவாகும்.",
        "lock.idle": "செயலற்றதன் பின் அமர்வு பூட்டப்பட்டது.",
        "lock.sensitive": "உணர்திறன் திரையில் அமர்வு பூட்டப்பட்டது.",
    },
}


class Translator(QObject):
    language_changed = Signal(str)

    def __init__(
        self, settings: DesktopSettings | None = None, parent: QObject | None = None
    ) -> None:
        super().__init__(parent)
        self.settings = settings or DesktopSettings()
        self._language = self.settings.language

    @staticmethod
    def supported_languages() -> tuple[tuple[str, str], ...]:
        return SUPPORTED_LANGUAGES

    @property
    def language(self) -> str:
        return self._language

    def set_language(self, code: str) -> None:
        value = str(code).strip().lower()
        if value not in CATALOGS or value == self._language:
            return
        self._language = value
        self.settings.language = value
        self.language_changed.emit(value)

    def tr(self, key: str, **values: Any) -> str:
        text = CATALOGS.get(self._language, {}).get(key)
        if text is None:
            text = CATALOGS[DEFAULT_LANGUAGE].get(key, key)
        if not values:
            return text
        try:
            return text.format(**values)
        except (KeyError, ValueError):
            return text


class LanguageComboBox(QComboBox):
    language_selected = Signal(str)

    def __init__(self, translator: Translator, parent: QWidget | None = None) -> None:
        super().__init__(parent)
        self.translator = translator
        self.setObjectName("LanguageSelector")
        self.setToolTip(translator.tr("language.label"))
        for code, name in SUPPORTED_LANGUAGES:
            self.addItem(name, code)
        self._sync_language(translator.language)
        self.currentIndexChanged.connect(self._on_index_changed)
        translator.language_changed.connect(self._sync_language)

    def _on_index_changed(self, index: int) -> None:
        if index < 0:
            return
        code = str(self.itemData(index))
        self.translator.set_language(code)
        self.language_selected.emit(code)

    def _sync_language(self, code: str) -> None:
        index = self.findData(str(code))
        if index >= 0 and index != self.currentIndex():
            self.setCurrentIndex(index)
        self.setToolTip(self.translator.tr("language.label"))
