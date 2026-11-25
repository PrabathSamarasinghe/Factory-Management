"""Read-only wrapper around the reporting service monitor endpoints."""

from __future__ import annotations

from decimal import Decimal, InvalidOperation
from typing import Any

from .api_client import ApiClient

_DECIMAL_KEYS = {
    "amount",
    "amountPaid",
    "avgCost",
    "avg_cost",
    "balance",
    "cash",
    "cashPosition",
    "collectedKg",
    "credit",
    "debit",
    "grossWeightKg",
    "kg",
    "kgCollected",
    "kgWeighed",
    "netWeightKg",
    "payables",
    "qty",
    "qtyOnHand",
    "qty_on_hand",
    "quantity",
    "reorderLevel",
    "reorder_level",
    "total",
    "totalNetKg",
    "totalValue",
    "value",
    "weight",
}


def decimal_text(value: Any, label: str = "Amount") -> str:
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


def _normalize_decimals(value: Any) -> Any:
    if isinstance(value, dict):
        normalized: dict[str, Any] = {}
        for key, item in value.items():
            if key in _DECIMAL_KEYS and item is not None and str(item).strip():
                normalized[key] = decimal_text(item, str(key))
            else:
                normalized[key] = _normalize_decimals(item)
        return normalized
    if isinstance(value, (list, tuple)):
        return [_normalize_decimals(item) for item in value]
    return value


class MonitoringApi:
    def __init__(self, client: ApiClient) -> None:
        self.client = client
        self.base = client.config.monitor_base

    def _get(self, path: str, params: dict[str, Any] | None = None) -> Any:
        return _normalize_decimals(self.client.get(self.base, path, params=params))

    def today(self) -> Any:
        return self._get("/today")

    def trips(self) -> Any:
        return self._get("/trips")

    def attendance(self) -> Any:
        return self._get("/attendance")

    def collections(self, date: str | None = None) -> Any:
        return self._get("/collections", {"date": date})

    def finance(self) -> Any:
        return self._get("/finance")

    def inventory(self) -> Any:
        return self._get("/inventory")

    def rebuild(self) -> Any:
        return self._get("/rebuild")

    dashboard = today
    live_trips = trips
    stock_alerts = inventory
