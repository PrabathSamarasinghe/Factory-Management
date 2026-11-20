"""Small helpers shared by the accounts pages."""

from __future__ import annotations

import json
from datetime import date
from decimal import Decimal, InvalidOperation
from typing import Any

from PySide6.QtWidgets import QWidget


def today_text() -> str:
    return date.today().isoformat()


def money_text(value: Any, label: str = "Amount") -> str:
    text = str(value if value is not None else "").strip()
    if not text:
        raise ValueError(f"{label} is required.")
    try:
        number = Decimal(text)
    except InvalidOperation as exc:
        raise ValueError(f"{label} must be a decimal number.") from exc
    if not number.is_finite():
        raise ValueError(f"{label} must be a finite decimal.")
    return format(number, "f")


def optional_money_text(value: Any, label: str = "Amount") -> str | None:
    if value is None or not str(value).strip():
        return None
    return money_text(value, label)


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


def flatten_accounts(data: Any) -> list[dict[str, Any]]:
    nodes = rows_of(data, "accounts", "tree", "data", "items")
    accounts: list[dict[str, Any]] = []

    def walk(items: list[dict[str, Any]]) -> None:
        for item in items:
            if "id" not in item and "code" not in item:
                continue
            accounts.append(item)
            children = rows_of(item, "children", "accounts", "items")
            walk(children)

    walk(nodes)
    return accounts


def account_label(account: dict[str, Any]) -> str:
    code = str(account.get("code") or "")
    name = str(account.get("name") or "")
    label = f"{code} {name}".strip()
    return label or str(account.get("id") or "-")


def row_id(row: dict[str, Any]) -> str:
    return str(row.get("id") or "")


def value_text(row: dict[str, Any]) -> str:
    values = row.get("values") or []
    if isinstance(values, list):
        return " | ".join(str(value) for value in values)
    return str(values)


def save_export(
    parent: QWidget | None,
    default_name: str,
    result: Any,
    file_format: str,
) -> bool:
    filters = {
        "csv": "CSV files (*.csv)",
        "json": "JSON files (*.json)",
        "pdf": "PDF files (*.pdf)",
        "xlsx": "Excel files (*.xlsx)",
    }
    path, _ = QFileDialog.getSaveFileName(
        parent,
        "Save report export",
        default_name,
        filters.get(file_format, "All files (*)"),
    )
    if not path:
        return False
    if isinstance(result, (bytes, bytearray)):
        content = bytes(result)
    elif isinstance(result, str):
        content = result.encode("utf-8")
    else:
        content = json.dumps(result, indent=2, default=str).encode("utf-8")
    with open(path, "wb") as handle:
        handle.write(content)
    return True
