"""Wrapper around collection service weighing and reporting endpoints."""

from __future__ import annotations

from collections.abc import Mapping
from decimal import Decimal, InvalidOperation
from typing import Any

from .api_client import ApiClient


def _weight_string(value: Any, label: str) -> str:
    if isinstance(value, (bool, float)):
        raise ValueError(f"{label} must be a decimal string.")
    text = str(value or "").strip()
    if not text:
        raise ValueError(f"{label} is required.")
    try:
        number = Decimal(text)
    except InvalidOperation as exc:
        raise ValueError(f"{label} must be a non-negative decimal.") from exc
    if not number.is_finite() or number < 0:
        raise ValueError(f"{label} must be a non-negative decimal.")
    return format(number, "f")


class CollectionApi:
    def __init__(self, client: ApiClient) -> None:
        self.client = client
        self.base = client.config.collection_base

    def get_readiness(self, trip_id: str) -> dict[str, Any]:
        return self.client.get(self.base, f"/trips/{trip_id}/readiness")

    def list_pickups(self, trip_id: str) -> list[dict[str, Any]]:
        return self.client.get(self.base, f"/trips/{trip_id}/pickups")

    def record_weighing(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        body = {key: value for key, value in payload.items() if value is not None}
        body["grossWeightKg"] = _weight_string(payload.get("grossWeightKg"), "grossWeightKg")
        body["tareKg"] = _weight_string(payload.get("tareKg"), "tareKg")
        body["netWeightKg"] = _weight_string(payload.get("netWeightKg"), "netWeightKg")
        if payload.get("deductionsKg") is not None:
            body["deductionsKg"] = _weight_string(payload["deductionsKg"], "deductionsKg")
        return self.client.post(self.base, "/weighings", json_body=body)

    def finalize_trip(self, trip_id: str) -> list[dict[str, Any]]:
        return self.client.post(self.base, f"/trips/{trip_id}/finalize")

    def list_discrepancies(self, status: str | None = None) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/weighings/discrepancies", params={"status": status})

    def resolve_discrepancy(
        self, id: str, status: str, note: str | None = None
    ) -> dict[str, Any]:
        body = {"status": status}
        if note is not None:
            body["note"] = note
        return self.client.post(
            self.base,
            f"/weighings/discrepancies/{id}/resolve",
            json_body=body,
        )

    def daily_totals(
        self, date: str | None = None, supplier_id: str | None = None
    ) -> list[dict[str, Any]]:
        return self.client.get(
            self.base,
            "/totals/daily",
            params={"date": date, "supplierId": supplier_id},
        )

    def statement(
        self,
        supplier_id: str,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> list[dict[str, Any]]:
        return self.client.get(
            self.base,
            f"/suppliers/{supplier_id}/statement",
            params={"from": from_date, "to": to_date},
        )
