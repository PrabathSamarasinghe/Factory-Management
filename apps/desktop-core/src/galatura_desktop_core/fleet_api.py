"""Wrapper around fleet, route, assignment and trip endpoints."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .api_client import ApiClient


class FleetApi:
    def __init__(self, client: ApiClient) -> None:
        self.client = client
        self.base = client.config.fleet_base

    # ------------------------------------------------------------------ lorries
    def list_lorries(
        self,
        *,
        status: str | None = None,
        query: str | None = None,
    ) -> list[dict[str, Any]]:
        return self.client.get(
            self.base,
            "/lorries",
            params={"status": status, "q": query},
        )

    def get_lorry(self, lorry_id: str) -> dict[str, Any]:
        return self.client.get(self.base, f"/lorries/{lorry_id}")

    def create_lorry(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(self.base, "/lorries", json_body=dict(payload))

    def update_lorry(self, lorry_id: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.patch(self.base, f"/lorries/{lorry_id}", json_body=dict(payload))

    def add_lorry_document(
        self, lorry_id: str, payload: Mapping[str, Any]
    ) -> dict[str, Any]:
        return self.client.post(
            self.base,
            f"/lorries/{lorry_id}/documents",
            json_body=dict(payload),
        )

    def add_lorry_maintenance(
        self, lorry_id: str, payload: Mapping[str, Any]
    ) -> dict[str, Any]:
        return self.client.post(
            self.base,
            f"/lorries/{lorry_id}/maintenance",
            json_body=dict(payload),
        )

    def alerts(self) -> dict[str, Any]:
        return self.client.get(self.base, "/lorries/alerts")

    # ------------------------------------------------------------------- routes
    def list_routes(
        self,
        *,
        status: str | None = None,
        query: str | None = None,
    ) -> list[dict[str, Any]]:
        return self.client.get(
            self.base,
            "/routes",
            params={"status": status, "q": query},
        )

    def get_route(self, route_id: str) -> dict[str, Any]:
        return self.client.get(self.base, f"/routes/{route_id}")

    def create_route(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(self.base, "/routes", json_body=dict(payload))

    def update_route(self, route_id: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.patch(self.base, f"/routes/{route_id}", json_body=dict(payload))

    def replace_route_stops(
        self, route_id: str, stops: list[Mapping[str, Any]]
    ) -> dict[str, Any]:
        return self.client.put(
            self.base,
            f"/routes/{route_id}/stops",
            json_body={"stops": [dict(stop) for stop in stops]},
        )

    # -------------------------------------------------------------- assignments
    def list_assignments(
        self,
        *,
        route_id: str | None = None,
        lorry_id: str | None = None,
        date: str | None = None,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        return self.client.get(
            self.base,
            "/assignments",
            params={
                "routeId": route_id,
                "lorryId": lorry_id,
                "date": date,
                "status": status,
            },
        )

    def create_assignment(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(self.base, "/assignments", json_body=dict(payload))

    def change_assignment(
        self, assignment_id: str, payload: Mapping[str, Any]
    ) -> dict[str, Any]:
        return self.client.post(
            self.base,
            f"/assignments/{assignment_id}/change",
            json_body=dict(payload),
        )

    # -------------------------------------------------------------------- trips
    def list_trips(
        self,
        *,
        from_date: str | None = None,
        to_date: str | None = None,
        lorry_id: str | None = None,
        route_id: str | None = None,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        return self.client.get(
            self.base,
            "/trips",
            params={
                "from": from_date,
                "to": to_date,
                "lorryId": lorry_id,
                "routeId": route_id,
                "status": status,
            },
        )

    def get_trip(self, trip_id: str) -> dict[str, Any]:
        return self.client.get(self.base, f"/trips/{trip_id}")

    def start_trip(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(self.base, "/trips", json_body=dict(payload))

    def add_trip_event(self, trip_id: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(
            self.base,
            f"/trips/{trip_id}/events",
            json_body=dict(payload),
        )

    def arrive_factory(self, trip_id: str) -> dict[str, Any]:
        return self.client.post(self.base, f"/trips/{trip_id}/arrive-factory")

    def end_trip(self, trip_id: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(
            self.base,
            f"/trips/{trip_id}/end",
            json_body=dict(payload),
        )

    def cancel_trip(self, trip_id: str, remarks: str | None = None) -> dict[str, Any]:
        return self.client.post(
            self.base,
            f"/trips/{trip_id}/cancel",
            json_body={"remarks": remarks},
        )
