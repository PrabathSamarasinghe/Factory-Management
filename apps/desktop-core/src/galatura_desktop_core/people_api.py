"""Wrapper around the people service endpoints (via the gateway)."""

from __future__ import annotations

from collections.abc import Mapping
from typing import Any

from .api_client import ApiClient


class PeopleApi:
    def __init__(self, client: ApiClient) -> None:
        self.client = client
        self.base = client.config.people_base

    # ------------------------------------------------------------------ persons
    def list_persons(
        self,
        *,
        person_type: str | None = None,
        status: str | None = None,
        query: str | None = None,
        route_id: str | None = None,
        page: int | None = None,
        limit: int | None = None,
    ) -> dict[str, Any]:
        return self.client.get(
            self.base,
            "/persons",
            params={
                "type": person_type,
                "status": status,
                "q": query,
                "route": route_id,
                "page": page,
                "limit": limit,
            },
        )

    def get_person(self, person_id: str) -> dict[str, Any]:
        return self.client.get(self.base, f"/persons/{person_id}")

    def create_person(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(self.base, "/persons", json_body=dict(payload))

    def update_person(self, person_id: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.patch(self.base, f"/persons/{person_id}", json_body=dict(payload))

    def update_status(self, person_id: str, status: str) -> dict[str, Any]:
        return self.client.post(
            self.base, f"/persons/{person_id}/status", json_body={"status": status}
        )

    # ---------------------------------------------------------------- suppliers
    def supplier_by_barcode(self, value: str) -> dict[str, Any]:
        return self.client.get(self.base, f"/suppliers/by-barcode/{value}")

    def supplier_by_reg_no(self, reg_no: str) -> dict[str, Any]:
        return self.client.get(self.base, f"/suppliers/by-reg-no/{reg_no}")

    def master_data_suppliers(self, updated_since: str | None = None) -> list[dict[str, Any]]:
        return self.client.get(
            self.base,
            "/master-data/suppliers",
            params={"updatedSince": updated_since},
        )

    # ------------------------------------------------------------ bank accounts
    def list_bank_accounts(self, person_id: str) -> list[dict[str, Any]]:
        return self.client.get(self.base, f"/persons/{person_id}/bank-accounts")

    def add_bank_account(self, person_id: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(
            self.base,
            f"/persons/{person_id}/bank-accounts",
            json_body=dict(payload),
        )

    def set_primary_bank_account(self, person_id: str, account_id: str) -> dict[str, Any]:
        return self.client.patch(
            self.base,
            f"/persons/{person_id}/bank-accounts/{account_id}/primary",
        )

    def delete_bank_account(self, person_id: str, account_id: str) -> None:
        self.client.delete(self.base, f"/persons/{person_id}/bank-accounts/{account_id}")

    def verify_bank_account(self, account_id: str) -> dict[str, Any]:
        return self.client.post(self.base, f"/bank-accounts/{account_id}/verify")

    # ---------------------------------------------------------------- documents
    def document_upload_url(self, person_id: str, filename: str, mime: str) -> dict[str, Any]:
        return self.client.get(
            self.base,
            f"/persons/{person_id}/documents/upload-url",
            params={"filename": filename, "mime": mime},
        )

    def list_documents(self, person_id: str) -> list[dict[str, Any]]:
        return self.client.get(self.base, f"/persons/{person_id}/documents")

    def add_document(self, person_id: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(
            self.base,
            f"/persons/{person_id}/documents",
            json_body=dict(payload),
        )

    def delete_document(self, person_id: str, document_id: str) -> None:
        self.client.delete(self.base, f"/persons/{person_id}/documents/{document_id}")

    def list_consents(self, person_id: str) -> list[dict[str, Any]]:
        return self.client.get(self.base, f"/persons/{person_id}/consents")

    def record_consent(self, person_id: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(
            self.base,
            f"/persons/{person_id}/consents",
            json_body=dict(payload),
        )

    # ----------------------------------------------------------------- barcodes
    def supplier_barcode_card(self, person_id: str) -> dict[str, Any]:
        return self.client.get(self.base, f"/suppliers/{person_id}/barcode")
