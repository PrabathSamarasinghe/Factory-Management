"""Wrapper around the inventory service endpoints."""

from __future__ import annotations

from collections.abc import Mapping
from decimal import Decimal, InvalidOperation
from typing import Any

from .api_client import ApiClient

_DECIMAL_KEYS = {
    "amount",
    "avgCost",
    "avg_cost",
    "balanceQty",
    "countedQty",
    "counted_qty",
    "cost",
    "qty",
    "qtyOnHand",
    "qty_on_hand",
    "quantity",
    "reorderLevel",
    "reorderQty",
    "reorder_level",
    "reorder_qty",
    "systemQty",
    "system_qty",
    "totalAmount",
    "unitCost",
    "unitPrice",
    "unit_cost",
    "unit_price",
    "variance",
}


def decimal_text(value: Any, label: str = "Quantity") -> str:
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
    if isinstance(value, list):
        return [_normalize_decimals(item) for item in value]
    if isinstance(value, tuple):
        return [_normalize_decimals(item) for item in value]
    return value


class InventoryApi:
    def __init__(self, client: ApiClient) -> None:
        self.client = client
        self.base = client.config.inventory_base

    def _payload(
        self,
        payload: Mapping[str, Any],
        idempotency_key: str | None = None,
        *,
        inject_key: bool = False,
    ) -> dict[str, Any]:
        data = _normalize_decimals(dict(payload))
        if inject_key and idempotency_key and "idempotencyKey" not in data:
            data["idempotencyKey"] = idempotency_key
        return data

    @staticmethod
    def _headers(idempotency_key: str | None = None) -> dict[str, str] | None:
        if not idempotency_key:
            return None
        return {"Idempotency-Key": idempotency_key}

    def health(self) -> Any:
        return self.client.get(self.base, "/health")

    def list_categories(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/categories")

    def create_category(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(
            self.base,
            "/categories",
            json_body=self._payload(payload),
        )

    def update_category(self, category_id: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.patch(
            self.base,
            f"/categories/{category_id}",
            json_body=self._payload(payload),
        )

    def list_units(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/units")

    def create_unit(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(self.base, "/units", json_body=self._payload(payload))

    def list_items(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/items")

    def create_item(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(self.base, "/items", json_body=self._payload(payload))

    def update_item(self, item_id: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.patch(
            self.base,
            f"/items/{item_id}",
            json_body=self._payload(payload),
        )

    def deactivate_item(self, item_id: str) -> dict[str, Any]:
        return self.client.post(self.base, f"/items/{item_id}/deactivate")

    def list_warehouses(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/warehouses")

    def create_warehouse(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(self.base, "/warehouses", json_body=self._payload(payload))

    def update_warehouse(self, warehouse_id: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.patch(
            self.base,
            f"/warehouses/{warehouse_id}",
            json_body=self._payload(payload),
        )

    def list_locations(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/locations")

    def create_location(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(self.base, "/locations", json_body=self._payload(payload))

    def list_vendors(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/vendors")

    def create_vendor(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(self.base, "/vendors", json_body=self._payload(payload))

    def update_vendor(self, vendor_id: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.patch(
            self.base,
            f"/vendors/{vendor_id}",
            json_body=self._payload(payload),
        )

    def list_goods_receipts(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/goods-receipts")

    def create_goods_receipt(
        self,
        payload: Mapping[str, Any],
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return self.client.post(
            self.base,
            "/goods-receipts",
            json_body=self._payload(payload, idempotency_key, inject_key=True),
            headers=self._headers(idempotency_key),
        )

    def approve_goods_receipt(
        self,
        receipt_id: str,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return self.client.post(
            self.base,
            f"/goods-receipts/{receipt_id}/approve",
            json_body=self._payload({}, idempotency_key, inject_key=True),
            headers=self._headers(idempotency_key),
        )

    def list_goods_issues(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/goods-issues")

    def create_goods_issue(
        self,
        payload: Mapping[str, Any],
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return self.client.post(
            self.base,
            "/goods-issues",
            json_body=self._payload(payload, idempotency_key, inject_key=True),
            headers=self._headers(idempotency_key),
        )

    def approve_goods_issue(
        self,
        issue_id: str,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return self.client.post(
            self.base,
            f"/goods-issues/{issue_id}/approve",
            json_body=self._payload({}, idempotency_key, inject_key=True),
            headers=self._headers(idempotency_key),
        )

    def list_transfers(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/transfers")

    def create_transfer(
        self,
        payload: Mapping[str, Any],
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return self.client.post(
            self.base,
            "/transfers",
            json_body=self._payload(payload, idempotency_key, inject_key=True),
            headers=self._headers(idempotency_key),
        )

    def approve_transfer(
        self,
        transfer_id: str,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return self.client.post(
            self.base,
            f"/transfers/{transfer_id}/approve",
            json_body=self._payload({}, idempotency_key, inject_key=True),
            headers=self._headers(idempotency_key),
        )

    def list_adjustments(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/adjustments")

    def create_adjustment(
        self,
        payload: Mapping[str, Any],
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return self.client.post(
            self.base,
            "/adjustments",
            json_body=self._payload(payload, idempotency_key, inject_key=True),
            headers=self._headers(idempotency_key),
        )

    def approve_adjustment(
        self,
        adjustment_id: str,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return self.client.post(
            self.base,
            f"/adjustments/{adjustment_id}/approve",
            json_body=self._payload({}, idempotency_key, inject_key=True),
            headers=self._headers(idempotency_key),
        )

    def list_stock_takes(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/stock-takes")

    def create_stock_take(
        self,
        payload: Mapping[str, Any],
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return self.client.post(
            self.base,
            "/stock-takes",
            json_body=self._payload(payload, idempotency_key, inject_key=True),
            headers=self._headers(idempotency_key),
        )

    def add_stock_take_line(
        self,
        take_id: str,
        payload: Mapping[str, Any],
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return self.client.post(
            self.base,
            f"/stock-takes/{take_id}/lines",
            json_body=self._payload(payload, idempotency_key, inject_key=True),
            headers=self._headers(idempotency_key),
        )

    def complete_stock_take(
        self,
        take_id: str,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return self.client.post(
            self.base,
            f"/stock-takes/{take_id}/complete",
            json_body=self._payload({}, idempotency_key, inject_key=True),
            headers=self._headers(idempotency_key),
        )

    def stock_balances(
        self,
        *,
        item_id: str | None = None,
        location_id: str | None = None,
    ) -> Any:
        return self.client.get(
            self.base,
            "/stock/balances",
            params={"itemId": item_id, "locationId": location_id},
        )

    def stock_movements(
        self,
        *,
        item_id: str | None = None,
        location_id: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> Any:
        return self.client.get(
            self.base,
            "/stock/movements",
            params={
                "itemId": item_id,
                "locationId": location_id,
                "from": from_date,
                "to": to_date,
            },
        )

    def low_stock_alerts(self) -> Any:
        return self.client.get(self.base, "/alerts/low-stock")

    def valuation_report(self, *, as_of: str | None = None) -> Any:
        return self.client.get(
            self.base,
            "/reports/valuation",
            params={"asOf": as_of},
        )

    categories = list_categories
    units = list_units
    items = list_items
    warehouses = list_warehouses
    locations = list_locations
    vendors = list_vendors
    goods_receipts = list_goods_receipts
    receipts = list_goods_receipts
    goods_issues = list_goods_issues
    issues = list_goods_issues
    create_goods_issues = create_goods_issue
    approve_goods_issues = approve_goods_issue
    transfers = list_transfers
    adjustments = list_adjustments
    stock_takes = list_stock_takes
    list_stock_balances = stock_balances
    list_stock_movements = stock_movements
    list_low_stock_alerts = low_stock_alerts
    get_valuation_report = valuation_report
    balances = stock_balances
    movements = stock_movements
    low_stock = low_stock_alerts
    valuation = valuation_report
