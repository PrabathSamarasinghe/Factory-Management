"""Reusable widgets and small UI helpers shared across pages."""

from __future__ import annotations

import logging
from collections.abc import Callable, Iterable, Sequence
from typing import Any, Self

from PySide6.QtCore import QObject, QRunnable, Qt, QThreadPool, Signal, Slot
from PySide6.QtGui import QColor
from PySide6.QtWidgets import (
    QAbstractItemView,
    QApplication,
    QDialog,
    QDialogButtonBox,
    QFormLayout,
    QFrame,
    QHBoxLayout,
    QHeaderView,
    QLabel,
    QMessageBox,
    QPushButton,
    QTableWidget,
    QTableWidgetItem,
    QVBoxLayout,
    QWidget,
)

from .errors import human_error

logger = logging.getLogger(__name__)

_active_workers: set[Worker] = set()


# ---------------------------------------------------------------- async helper
class WorkerSignals(QObject):
    finished = Signal(object)
    failed = Signal(object)
    done = Signal()


class Worker(QRunnable):
    """Runs a callable on the global thread pool and reports back via signals."""

    def __init__(self, fn: Callable[[], Any]) -> None:
        super().__init__()
        self.fn = fn
        self.signals = WorkerSignals()
        self.setAutoDelete(False)

    @Slot()
    def run(self) -> None:  # pragma: no cover - runs off the UI thread
        try:
            result = self.fn()
        except BaseException as exc:
            logger.debug("Background task failed", exc_info=True)
            try:
                self.signals.failed.emit(exc)
            except RuntimeError:
                pass
        else:
            try:
                self.signals.finished.emit(result)
            except RuntimeError:
                pass
        finally:
            try:
                self.signals.done.emit()
            except RuntimeError:
                pass


class _TaskContext(QObject):
    """Lives in the UI thread so callbacks are always delivered there."""

    def __init__(
        self,
        worker: Worker,
        on_success: Callable[[Any], None] | None,
        on_error: Callable[[BaseException], None] | None,
    ) -> None:
        super().__init__()
        self.worker = worker
        self._on_success = on_success
        self._on_error = on_error
        worker.signals.finished.connect(self._handle_success)
        worker.signals.failed.connect(self._handle_error)
        worker.signals.done.connect(self._handle_done)

    @Slot(object)
    def _handle_success(self, result: Any) -> None:
        if self._on_success is None:
            return
        try:
            self._on_success(result)
        except RuntimeError:
            # The receiving widget was destroyed while the task was running.
            logger.debug("Discarding task result for a destroyed widget.")

    @Slot(object)
    def _handle_error(self, error: BaseException) -> None:
        if self._on_error is None:
            logger.error("Unhandled background error: %s", error)
            return
        try:
            self._on_error(error)
        except RuntimeError:
            logger.debug("Discarding task error for a destroyed widget.")

    @Slot()
    def _handle_done(self) -> None:
        _active_workers.discard(self.worker)


def run_async(
    fn: Callable[[], Any],
    on_success: Callable[[Any], None] | None = None,
    on_error: Callable[[BaseException], None] | None = None,
) -> Worker:
    worker = Worker(fn)
    _active_workers.add(worker)
    # Keep the context alive for the lifetime of the task.
    context = _TaskContext(worker, on_success, on_error)
    worker._context = context  # type: ignore[attr-defined]
    QThreadPool.globalInstance().start(worker)
    return worker


class BusyCursor:
    def __enter__(self) -> Self:
        QApplication.setOverrideCursor(Qt.CursorShape.WaitCursor)
        return self

    def __exit__(self, *exc: object) -> None:
        QApplication.restoreOverrideCursor()


# ---------------------------------------------------------------- formatting
def format_datetime(value: Any) -> str:
    if not value:
        return "-"
    text = str(value)
    try:
        from datetime import datetime

        parsed = datetime.fromisoformat(text)
        return parsed.strftime("%Y-%m-%d %H:%M")
    except ValueError:
        return text


def format_date(value: Any) -> str:
    if not value:
        return "-"
    return str(value)[:10]


def format_bool(value: Any, *, yes: str = "Yes", no: str = "No") -> str:
    return yes if value else no


def format_money(value: Any, currency: str = "LKR") -> str:
    if value is None or value == "":
        return "-"
    try:
        return f"{currency} {float(value):,.2f}"
    except (TypeError, ValueError):
        return str(value)


def title_case(value: Any) -> str:
    if value is None:
        return "-"
    return str(value).replace("_", " ").title()


# -------------------------------------------------------------------- widgets
class PageHeader(QWidget):
    def __init__(self, title: str, subtitle: str = "", parent: QWidget | None = None):
        super().__init__(parent)
        layout = QHBoxLayout(self)
        layout.setContentsMargins(0, 0, 0, 0)
        layout.setSpacing(12)

        text_layout = QVBoxLayout()
        text_layout.setSpacing(2)
        self.title_label = QLabel(title)
        self.title_label.setObjectName("PageTitle")
        self.subtitle_label = QLabel(subtitle)
        self.subtitle_label.setObjectName("Subtitle")
        self.subtitle_label.setVisible(bool(subtitle))
        text_layout.addWidget(self.title_label)
        text_layout.addWidget(self.subtitle_label)

        layout.addLayout(text_layout)
        layout.addStretch(1)
        self._actions = QHBoxLayout()
        self._actions.setSpacing(8)
        layout.addLayout(self._actions)

    def add_action(self, widget: QWidget) -> None:
        self._actions.addWidget(widget)

    def set_subtitle(self, text: str) -> None:
        self.subtitle_label.setText(text)
        self.subtitle_label.setVisible(bool(text))


class StatusBanner(QFrame):
    def __init__(self, parent: QWidget | None = None):
        super().__init__(parent)
        self.setObjectName("Banner")
        layout = QHBoxLayout(self)
        layout.setContentsMargins(10, 8, 10, 8)
        self.label = QLabel("")
        self.label.setWordWrap(True)
        layout.addWidget(self.label, 1)
        self.setVisible(False)

    def _show(self, message: str, kind: str) -> None:
        self.label.setText(message)
        self.setObjectName(f"Banner{kind}")
        self.style().unpolish(self)
        self.style().polish(self)
        self.setVisible(True)

    def show_error(self, message: str) -> None:
        self._show(message, "Error")

    def show_success(self, message: str) -> None:
        self._show(message, "Success")

    def show_info(self, message: str) -> None:
        self._show(message, "Info")

    def clear(self) -> None:
        self.label.clear()
        self.setVisible(False)


class DataTable(QTableWidget):
    """Table that keeps the underlying row dictionaries for easy selection."""

    def __init__(
        self,
        columns: Sequence[tuple[str, str] | tuple[str, str, int]] | None = None,
        parent: QWidget | None = None,
    ):
        super().__init__(parent)
        self._columns: list[tuple[str, str, int | None]] = []
        self._rows: list[dict[str, Any]] = []
        self._formatters: dict[str, Callable[[Any, dict[str, Any]], str]] = {}

        self.setEditTriggers(QAbstractItemView.EditTrigger.NoEditTriggers)
        self.setSelectionBehavior(QAbstractItemView.SelectionBehavior.SelectRows)
        self.setSelectionMode(QAbstractItemView.SelectionMode.SingleSelection)
        self.setAlternatingRowColors(True)
        self.setShowGrid(False)
        self.setWordWrap(False)
        self.verticalHeader().setVisible(False)
        self.horizontalHeader().setStretchLastSection(True)
        self.horizontalHeader().setHighlightSections(False)

        if columns:
            self.set_columns(columns)

    def set_columns(self, columns: Sequence[tuple[str, str] | tuple[str, str, int]]) -> None:
        self._columns = [
            (col[0], col[1], col[2] if len(col) > 2 else None)  # type: ignore[index]
            for col in columns
        ]
        self.setColumnCount(len(self._columns))
        self.setHorizontalHeaderLabels([col[1] for col in self._columns])
        for index, (_, _, width) in enumerate(self._columns):
            if width:
                self.setColumnWidth(index, width)
        if self._columns:
            self.horizontalHeader().setSectionResizeMode(
                len(self._columns) - 1, QHeaderView.ResizeMode.Stretch
            )

    def set_formatter(self, key: str, formatter: Callable[[Any, dict[str, Any]], str]) -> None:
        self._formatters[key] = formatter

    def set_rows(self, rows: Iterable[dict[str, Any]]) -> None:
        self._rows = list(rows)
        self.setRowCount(len(self._rows))
        for row_index, row in enumerate(self._rows):
            for col_index, (key, _, _) in enumerate(self._columns):
                raw = row.get(key)
                formatter = self._formatters.get(key)
                text = formatter(raw, row) if formatter else ("" if raw is None else str(raw))
                item = QTableWidgetItem(text)
                if col_index == 0:
                    item.setData(Qt.ItemDataRole.UserRole, row_index)
                self.setItem(row_index, col_index, item)

    def row_data(self, row_index: int) -> dict[str, Any] | None:
        if 0 <= row_index < len(self._rows):
            return self._rows[row_index]
        return None

    def selected_row(self) -> dict[str, Any] | None:
        indexes = self.selectionModel().selectedRows() if self.selectionModel() else []
        if not indexes:
            return None
        return self.row_data(indexes[0].row())

    def selected_rows(self) -> list[dict[str, Any]]:
        indexes = self.selectionModel().selectedRows() if self.selectionModel() else []
        return [row for row in (self.row_data(i.row()) for i in indexes) if row]

    def clear_rows(self) -> None:
        self._rows = []
        self.setRowCount(0)


class StatCard(QFrame):
    def __init__(self, label: str, value: str = "-", parent: QWidget | None = None):
        super().__init__(parent)
        self.setObjectName("Card")
        layout = QVBoxLayout(self)
        layout.setContentsMargins(18, 16, 18, 16)
        layout.setSpacing(4)

        self.value_label = QLabel(value)
        self.value_label.setObjectName("StatValue")
        label_widget = QLabel(label)
        label_widget.setObjectName("StatLabel")

        layout.addWidget(label_widget)
        layout.addWidget(self.value_label)

    def set_value(self, value: Any) -> None:
        self.value_label.setText(str(value))


class FormDialog(QDialog):
    """Base dialog with a form, validation hook and OK/Cancel buttons."""

    def __init__(self, title: str, parent: QWidget | None = None):
        super().__init__(parent)
        self.setWindowTitle(title)
        self.setModal(True)
        self.setMinimumWidth(520)
        self.payload: dict[str, Any] = {}

        self._layout = QVBoxLayout(self)
        self._layout.setContentsMargins(18, 18, 18, 18)
        self._layout.setSpacing(12)

        self.banner = StatusBanner()
        self._layout.addWidget(self.banner)

        self.form = QFormLayout()
        self.form.setLabelAlignment(Qt.AlignmentFlag.AlignRight)
        self.form.setHorizontalSpacing(14)
        self.form.setVerticalSpacing(10)
        self._layout.addLayout(self.form)
        self._layout.addStretch(1)

        self.buttons = QDialogButtonBox(
            QDialogButtonBox.StandardButton.Ok | QDialogButtonBox.StandardButton.Cancel
        )
        self.buttons.accepted.connect(self._on_accept)
        self.buttons.rejected.connect(self.reject)
        self._layout.addWidget(self.buttons)

    def add_row(self, label: str, widget: QWidget) -> None:
        self.form.addRow(label, widget)

    def add_section(self, title: str) -> None:
        label = QLabel(title)
        label.setObjectName("PageTitle")
        label.setStyleSheet("font-size: 11pt; margin-top: 8px;")
        self.form.addRow(label)

    def validate(self) -> str | None:
        return None

    def collect(self) -> dict[str, Any]:
        return {}

    def _on_accept(self) -> None:
        error = self.validate()
        if error:
            self.banner.show_error(error)
            return
        self.payload = self.collect()
        self.accept()


# ------------------------------------------------------------------ dialogs
def confirm(parent: QWidget | None, title: str, text: str) -> bool:
    result = QMessageBox.question(
        parent,
        title,
        text,
        QMessageBox.StandardButton.Yes | QMessageBox.StandardButton.No,
        QMessageBox.StandardButton.No,
    )
    return result == QMessageBox.StandardButton.Yes


def show_error(parent: QWidget | None, title: str, error: BaseException) -> None:
    QMessageBox.critical(parent, title, human_error(error))


def show_info(parent: QWidget | None, title: str, text: str) -> None:
    QMessageBox.information(parent, title, text)


def show_success(parent: QWidget | None, text: str) -> None:
    QMessageBox.information(parent, "Done", text)


def primary_button(text: str, parent: QWidget | None = None) -> QPushButton:
    button = QPushButton(text, parent)
    button.setObjectName("Primary")
    return button


def danger_button(text: str, parent: QWidget | None = None) -> QPushButton:
    button = QPushButton(text, parent)
    button.setObjectName("Danger")
    return button


def ghost_button(text: str, parent: QWidget | None = None) -> QPushButton:
    button = QPushButton(text, parent)
    button.setObjectName("Ghost")
    return button


def muted_label(text: str) -> QLabel:
    label = QLabel(text)
    label.setObjectName("Muted")
    return label


def status_color(value: Any) -> QColor:
    text = str(value).upper()
    if text in {"ACTIVE", "APPROVED", "VERIFIED", "TRUE", "SUCCESS"}:
        return QColor("#37b57f")
    if text in {"PENDING", "SUSPENDED"}:
        return QColor("#d9a441")
    if text in {"LOCKED", "REJECTED", "INACTIVE", "FAILED", "FALSE"}:
        return QColor("#d9534f")
    return QColor("#8aa0b2")
