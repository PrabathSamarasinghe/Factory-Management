"""Form helpers for reference-backed inventory dialogs."""

from __future__ import annotations

from typing import Any

from galatura_desktop_core.widgets import FormDialog
from PySide6.QtWidgets import QComboBox, QWidget

from ..pages.common import label_for, row_id, rows_of


def populate_combo(
    combo: QComboBox,
    rows: list[dict[str, Any]],
    *label_keys: str,
    blank: bool = False,
    current: str | None = None,
) -> None:
    combo.clear()
    if blank:
        combo.addItem("-", None)
    for row in rows:
        combo.addItem(label_for(row, *label_keys), row_id(row))
    if current:
        index = combo.findData(current)
        if index >= 0:
            combo.setCurrentIndex(index)


class ReferenceFormDialog(FormDialog):
    def __init__(
        self,
        title: str,
        references: dict[str, Any] | None = None,
        parent: QWidget | None = None,
    ) -> None:
        super().__init__(title, parent)
        self.references = references or {}

    def add_combo(
        self,
        label: str,
        reference_key: str,
        *label_keys: str,
        blank: bool = False,
    ) -> QComboBox:
        combo = QComboBox()
        populate_combo(
            combo,
            rows_of(self.references.get(reference_key)),
            *label_keys,
            blank=blank,
        )
        self.add_row(label, combo)
        return combo

    def selected_id(self, combo: QComboBox) -> str:
        return str(combo.currentData() or "").strip()
