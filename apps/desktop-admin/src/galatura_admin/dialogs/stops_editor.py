"""Route stop sequence editor."""

from __future__ import annotations

from typing import Any

from PySide6.QtWidgets import (
    QAbstractItemView,
    QDialog,
    QDialogButtonBox,
    QHBoxLayout,
    QHeaderView,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)


class StopsEditorDialog(QDialog):
    def __init__(self, stops: list[dict[str, Any]], parent: QWidget | None = None):
        super().__init__(parent)
        self.setWindowTitle("Edit route stops")
        self.setModal(True)
        self.resize(760, 480)
        self.stops_payload: list[dict[str, Any]] = []

        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 18, 18, 18)
        layout.setSpacing(10)
        self.table = QTableWidget(0, 4)
        self.table.setHorizontalHeaderLabels(
            ["Sequence", "Supplier ID", "Expected arrival", "Notes"]
        )
        self.table.horizontalHeader().setSectionResizeMode(QHeaderView.ResizeMode.Stretch)
        self.table.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.table.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        layout.addWidget(self.table, 1)

        actions = QHBoxLayout()
        add_button = QPushButton("Add stop")
        add_button.clicked.connect(self._add_row)
        remove_button = QPushButton("Remove selected")
        remove_button.clicked.connect(self._remove_row)
        actions.addWidget(add_button)
        actions.addWidget(remove_button)
        actions.addStretch(1)
        layout.addLayout(actions)

        buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        buttons.accepted.connect(self._accept)
        buttons.rejected.connect(self.reject)
        layout.addWidget(buttons)

        for stop in sorted(stops, key=lambda item: _sequence(item.get("sequence"))):
            self._add_row(stop)

    def _add_row(self, stop: dict[str, Any] | None = None) -> None:
        row = self.table.rowCount()
        self.table.insertRow(row)
        self.table.setItem(row, 0, QTableWidgetItem(str((stop or {}).get("sequence") or row + 1)))
        self.table.setItem(row, 1, QTableWidgetItem(str((stop or {}).get("supplierId") or "")))
        arrival = str((stop or {}).get("expectedArrival") or "")[:5]
        self.table.setItem(row, 2, QTableWidgetItem(arrival))
        self.table.setItem(row, 3, QTableWidgetItem(str((stop or {}).get("notes") or "")))

    def _remove_row(self) -> None:
        indexes = self.table.selectionModel().selectedRows() if self.table.selectionModel() else []
        if indexes:
            self.table.removeRow(indexes[0].row())

    def _cell(self, row: int, column: int) -> str:
        item = self.table.item(row, column)
        return item.text().strip() if item else ""

    def _accept(self) -> None:
        stops: list[dict[str, Any]] = []
        sequences: set[int] = set()
        for row in range(self.table.rowCount()):
            supplier_id = self._cell(row, 1)
            sequence_text = self._cell(row, 0)
            if not supplier_id:
                self.stops_payload = []
                self.table.selectRow(row)
                return
            try:
                sequence = int(sequence_text)
            except ValueError:
                self.stops_payload = []
                self.table.selectRow(row)
                return
            if sequence in sequences:
                self.stops_payload = []
                self.table.selectRow(row)
                return
            sequences.add(sequence)
            stops.append(
                {
                    "supplierId": supplier_id,
                    "sequence": sequence,
                    "expectedArrival": _optional(self._cell(row, 2)),
                    "notes": _optional(self._cell(row, 3)),
                }
            )
        self.stops_payload = sorted(stops, key=lambda stop: stop["sequence"])
        self.accept()


def _sequence(value: Any) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return 0


def _optional(value: str) -> str | None:
    return value or None
