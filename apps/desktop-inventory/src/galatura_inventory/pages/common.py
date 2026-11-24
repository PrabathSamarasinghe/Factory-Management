"""Small helpers shared by the inventory pages."""

from __future__ import annotations

from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from PySide6.QtWidgets import QWidget


def today_text() -> str:
    return date.today().isoformat()


def decimal_text(value: Any, label: str, *, allow_negative: bool = False) -> str:
    text = str(value if value is not None else "").strip()
    if not text:
        raise ValueError(f"{label} is required.")
    try:
        number = Decimal(text)
    except InvalidOperation as exc:
        raise ValueError(f"{label} must be a decimal number.") from exc
    if not number.is_finite():
        raise ValueError(f"{label} must be a finite decimal.")
    if not allow_negative and number < 0:
        raise ValueError(f"{label} must be non-negative.")
    return format(number, "f")


def optional_decimal_text(
    value: Any,
    label: str,
    *,
    allow_negative: bool = False,
) -> str | None:
    if value is None or not str(value).strip():
        return None
    return decimal_text(value, label, allow_negative=allow_negative)


def required_text(value: Any, label: str) -> str:
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{label} is required.")
    return text


def rows_of(data: Any, *keys: str) -> list[dict[str, Any]]:
    if isinstance(data, list):
        return [row for row in data if isinstance(row, dict)]
    if isinstance(data, dict):
        for key in (*keys, "rows", "data", "items"):
            candidate = data.get(key)
            if isinstance(candidate, list):
                return [row for row in candidate if isinstance(row, dict)]
            if isinstance(candidate, dict):
                nested = rows_of(candidate, *keys)
                if nested:
                    return nested
    return []


def details_of(data: Any, *keys: str) -> dict[str, Any]:
    if isinstance(data, dict):
        for key in keys:
            candidate = data.get(key)
            if isinstance(candidate, dict):
                return candidate
        return data
    return {}


def row_id(row: dict[str, Any] | None) -> str:
    if not row:
        return ""
    return str(row.get("id") or "")


def label_for(row: dict[str, Any] | None, *keys: str) -> str:
    if not row:
        return "-"
    for key in (*keys, "name", "code", "sku", "id"):
        value = row.get(key)
        if value not in (None, ""):
            return str(value)
    return "-"


def find_row(rows: list[dict[str, Any]], row_identifier: str) -> dict[str, Any] | None:
    for row in rows:
        if row_id(row) == row_identifier:
            return row
    return None


def quantity_text(value: Any) -> str:
    try:
        return format(Decimal(str(value)), "f") if value not in (None, "") else "-"
    except (InvalidOperation, TypeError):
        return str(value)


def format_quantity(value: Any, _row: dict[str, Any]) -> str:
    return quantity_text(value)


def validate_required(parent: QWidget, message: str) -> None:
    from galatura_desktop_core.widgets import show_error

    show_error(parent, "Missing information", message)
