"""Wrapper around the accounts service endpoints."""

from __future__ import annotations

from collections.abc import Mapping
from decimal import Decimal, InvalidOperation
from typing import Any

from .api_client import ApiClient

_MONEY_KEYS = {
    "amount",
    "credit",
    "debit",
    "ratePerKg",
    "statementBalance",
    "totalAmount",
}


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


def _normalize_money(value: Any) -> Any:
    if isinstance(value, dict):
        normalized: dict[str, Any] = {}
        for key, item in value.items():
            if key in _MONEY_KEYS and item is not None and str(item).strip():
                normalized[key] = money_text(item, str(key))
            else:
                normalized[key] = _normalize_money(item)
        return normalized
    if isinstance(value, list):
        return [_normalize_money(item) for item in value]
    if isinstance(value, tuple):
        return [_normalize_money(item) for item in value]
    return value


class AccountsApi:
    def __init__(self, client: ApiClient) -> None:
        self.client = client
        self.base = client.config.accounts_base

    def _payload(
        self,
        payload: Mapping[str, Any],
        idempotency_key: str | None = None,
        *,
        inject_key: bool = False,
    ) -> dict[str, Any]:
        data = _normalize_money(dict(payload))
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

    def accounts_tree(self) -> Any:
        return self.client.get(self.base, "/accounts/tree")

    def create_account(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(self.base, "/accounts", json_body=self._payload(payload))

    def update_account(self, account_id: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.patch(
            self.base,
            f"/accounts/{account_id}",
            json_body=self._payload(payload),
        )

    def deactivate_account(self, account_id: str) -> dict[str, Any]:
        return self.client.post(self.base, f"/accounts/{account_id}/deactivate")

    def list_fiscal_years(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/fiscal-years")

    def create_fiscal_year(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(self.base, "/fiscal-years", json_body=self._payload(payload))

    def list_fiscal_periods(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/fiscal-periods")

    def create_fiscal_period(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(self.base, "/fiscal-periods", json_body=self._payload(payload))

    def list_journal_entries(
        self,
        *,
        from_date: str | None = None,
        to_date: str | None = None,
        source_type: str | None = None,
    ) -> list[dict[str, Any]]:
        return self.client.get(
            self.base,
            "/journal-entries",
            params={"from": from_date, "to": to_date, "source": source_type},
        )

    def create_journal_entry(
        self,
        payload: Mapping[str, Any],
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return self.client.post(
            self.base,
            "/journal-entries",
            json_body=self._payload(payload, idempotency_key, inject_key=True),
            headers=self._headers(idempotency_key),
        )

    def post_journal_entry(self, entry_id: str, idempotency_key: str) -> dict[str, Any]:
        return self.client.post(
            self.base,
            f"/journal-entries/{entry_id}/post",
            json_body={"idempotencyKey": idempotency_key},
            headers=self._headers(idempotency_key),
        )

    def reverse_journal_entry(
        self,
        entry_id: str,
        *,
        reason: str | None = None,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return self.client.post(
            self.base,
            f"/journal-entries/{entry_id}/reverse",
            json_body={"reason": reason},
            headers=self._headers(idempotency_key),
        )

    def post_opening_entry(
        self,
        payload: Mapping[str, Any],
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return self.client.post(
            self.base,
            "/journal-entries/opening",
            json_body=self._payload(payload, idempotency_key, inject_key=True),
            headers=self._headers(idempotency_key),
        )

    def ledger(
        self,
        account_id: str,
        *,
        from_date: str | None = None,
        to_date: str | None = None,
        as_of: str | None = None,
        party_id: str | None = None,
    ) -> Any:
        return self.client.get(
            self.base,
            f"/ledger/{account_id}",
            params={
                "from": from_date,
                "to": to_date,
                "asOf": as_of,
                "partyId": party_id,
            },
        )

    def t_account(self, account_id: str, *, as_of: str | None = None) -> Any:
        return self.client.get(
            self.base,
            f"/t-accounts/{account_id}",
            params={"asOf": as_of},
        )

    def trial_balance(
        self,
        *,
        as_of: str | None = None,
        period_id: str | None = None,
    ) -> Any:
        return self.client.get(
            self.base,
            "/reports/trial-balance",
            params={"asOf": as_of, "periodId": period_id},
        )

    def profit_loss(
        self,
        *,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> Any:
        return self.client.get(
            self.base,
            "/reports/profit-loss",
            params={"from": from_date, "to": to_date},
        )

    def balance_sheet(self, *, as_of: str | None = None) -> Any:
        return self.client.get(
            self.base,
            "/reports/balance-sheet",
            params={"asOf": as_of},
        )

    def cash_flow(
        self,
        *,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> Any:
        return self.client.get(
            self.base,
            "/reports/cash-flow",
            params={"from": from_date, "to": to_date},
        )

    def supplier_aging(self, *, as_of: str | None = None) -> Any:
        return self.client.get(
            self.base,
            "/reports/supplier-aging",
            params={"asOf": as_of},
        )

    def export_report(
        self,
        report_type: str,
        *,
        file_format: str = "csv",
        as_of: str | None = None,
        from_date: str | None = None,
        to_date: str | None = None,
    ) -> Any:
        binary = file_format in {"pdf", "xlsx"}
        accept = "application/octet-stream" if binary else "*/*"
        return self.client.get(
            self.base,
            f"/reports/{report_type}/export",
            params={"format": file_format, "asOf": as_of, "from": from_date, "to": to_date},
            headers={"Accept": accept},
            raw_response=binary,
        )

    def supplier_payable(self, supplier_id: str, *, as_of: str | None = None) -> Any:
        return self.client.get(
            self.base,
            f"/suppliers/{supplier_id}/payable",
            params={"asOf": as_of},
        )

    def employee_wages_due(self, employee_id: str, *, as_of: str | None = None) -> Any:
        return self.client.get(
            self.base,
            f"/employees/{employee_id}/wages-due",
            params={"asOf": as_of},
        )

    def list_rates(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/rates")

    def create_rate(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(self.base, "/rates", json_body=self._payload(payload))

    def update_rate(self, rate_id: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.patch(
            self.base,
            f"/rates/{rate_id}",
            json_body=self._payload(payload),
        )

    def list_supplier_bills(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/supplier-bills")

    def generate_supplier_bills(
        self,
        payload: Mapping[str, Any],
        idempotency_key: str | None = None,
    ) -> Any:
        return self.client.post(
            self.base,
            "/supplier-bills/generate",
            json_body=self._payload(payload, idempotency_key, inject_key=True),
            headers=self._headers(idempotency_key),
        )

    def approve_supplier_bill(self, bill_id: str, idempotency_key: str) -> dict[str, Any]:
        return self.client.post(
            self.base,
            f"/supplier-bills/{bill_id}/approve",
            json_body={"idempotencyKey": idempotency_key},
            headers=self._headers(idempotency_key),
        )

    def list_wage_components(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/wage-components")

    def create_wage_component(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(
            self.base,
            "/wage-components",
            json_body=self._payload(payload),
        )

    def list_payroll_runs(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/payroll-runs")

    def calculate_payroll(
        self,
        payload: Mapping[str, Any],
        idempotency_key: str | None = None,
    ) -> Any:
        return self.client.post(
            self.base,
            "/payroll-runs/calculate",
            json_body=self._payload(payload, idempotency_key, inject_key=True),
            headers=self._headers(idempotency_key),
        )

    def approve_payroll_run(self, run_id: str, idempotency_key: str) -> dict[str, Any]:
        return self.client.post(
            self.base,
            f"/payroll-runs/{run_id}/approve",
            json_body={"idempotencyKey": idempotency_key},
            headers=self._headers(idempotency_key),
        )

    def list_supplier_adjustments(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/supplier-adjustments")

    def create_supplier_adjustment(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(
            self.base,
            "/supplier-adjustments",
            json_body=self._payload(payload),
        )

    def recover_supplier_adjustment(
        self,
        adjustment_id: str,
        *,
        amount: Any | None = None,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {}
        if amount is not None and str(amount).strip():
            payload["amount"] = amount
        return self.client.post(
            self.base,
            f"/supplier-adjustments/{adjustment_id}/recover",
            json_body=self._payload(payload, idempotency_key, inject_key=True),
            headers=self._headers(idempotency_key),
        )

    def list_payment_batches(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/payment-batches")

    def create_payment_batch(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(
            self.base,
            "/payment-batches",
            json_body=self._payload(payload),
        )

    def approve_payment_batch(self, batch_id: str, idempotency_key: str) -> dict[str, Any]:
        return self.client.post(
            self.base,
            f"/payment-batches/{batch_id}/approve",
            json_body={"idempotencyKey": idempotency_key},
            headers=self._headers(idempotency_key),
        )

    def payment_batch_bank_file(self, batch_id: str) -> Any:
        return self.client.get(self.base, f"/payment-batches/{batch_id}/bank-file")

    def list_payments(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/payments")

    def create_payment(
        self,
        payload: Mapping[str, Any],
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        return self.client.post(
            self.base,
            "/payments",
            json_body=self._payload(payload, idempotency_key, inject_key=True),
            headers=self._headers(idempotency_key),
        )

    def mark_payment_paid(
        self,
        payment_id: str,
        *,
        paid_date: str | None = None,
        reference: str | None = None,
        idempotency_key: str | None = None,
    ) -> dict[str, Any]:
        payload = {"paidDate": paid_date, "reference": reference}
        return self.client.post(
            self.base,
            f"/payments/{payment_id}/mark-paid",
            json_body=self._payload(payload, idempotency_key, inject_key=True),
            headers=self._headers(idempotency_key),
        )

    def list_periods(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/periods")

    def lock_period(self, period_id: str) -> dict[str, Any]:
        return self.client.post(self.base, f"/periods/{period_id}/lock")

    def close_period(self, period_id: str) -> dict[str, Any]:
        return self.client.post(self.base, f"/periods/{period_id}/close")

    def list_posting_rules(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/posting-rules")

    def create_posting_rule(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(
            self.base,
            "/posting-rules",
            json_body=self._payload(payload),
        )

    def list_report_sections(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/report-sections")

    def update_report_section(self, code: str, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.put(
            self.base,
            f"/report-sections/{code}",
            json_body=self._payload(payload),
        )

    def list_budgets(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/budgets")

    def create_budget(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(self.base, "/budgets", json_body=self._payload(payload))

    def list_bank_accounts(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/bank-accounts")

    def create_bank_account(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(
            self.base,
            "/bank-accounts",
            json_body=self._payload(payload),
        )

    def list_reconciliations(self) -> list[dict[str, Any]]:
        return self.client.get(self.base, "/reconciliations")

    def create_reconciliation(self, payload: Mapping[str, Any]) -> dict[str, Any]:
        return self.client.post(
            self.base,
            "/reconciliations",
            json_body=self._payload(payload),
        )

    def add_reconciliation_line(
        self,
        reconciliation_id: str,
        payload: Mapping[str, Any],
    ) -> dict[str, Any]:
        return self.client.post(
            self.base,
            f"/reconciliations/{reconciliation_id}/lines",
            json_body=self._payload(payload),
        )

    def match_reconciliation(
        self,
        reconciliation_id: str,
        *,
        line_id: str,
        journal_line_id: str,
    ) -> dict[str, Any]:
        return self.client.post(
            self.base,
            f"/reconciliations/{reconciliation_id}/match",
            json_body={"lineId": line_id, "journalLineId": journal_line_id},
        )
