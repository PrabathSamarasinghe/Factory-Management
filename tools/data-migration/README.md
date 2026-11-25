# Data Migration Tooling (Phase 10.4)

Migrates existing suppliers, employees and opening balances from a reviewed JSON manifest into people-service and accounts-service. The CLI uses Node 24 built-ins only and never imports application code or database clients.

## Files

- `tools/data-migration/lib.mjs` - validation, plan construction, stable keys, redaction, summaries and argument parsing.
- `tools/data-migration/migrate.mjs` - the CLI entry point.
- `tools/data-migration/migration.example.json` - a small, obviously fake, valid manifest.
- `tools/data-migration/lib.test.mjs` - `node:test` unit tests.

## Input schema

```json
{
  "version": 1,
  "environment": "staging | production",
  "asOfDate": "YYYY-MM-DD",
  "people": [
    {
      "externalId": "UUID",
      "personType": "EMPLOYEE | SUPPLIER",
      "code": "optional legacy code",
      "fullName": "required name",
      "nationalId": "optional 9 digits + V/X or 12 digits",
      "phonePrimary": "optional +94/94/0 followed by 9 digits",
      "employeeDetails": {},
      "supplierDetails": {}
    }
  ],
  "balances": [
    {
      "partyType": "SUPPLIER | EMPLOYEE",
      "externalId": "UUID matching a person",
      "accountCode": "chart-of-accounts code",
      "debit": "non-negative decimal string, max 2 places",
      "credit": "non-negative decimal string, max 2 places",
      "description": "optional memo"
    }
  ]
}
```

Validation rules:

- `version` must be `1`; `environment` must be `staging` or `production`; `asOfDate` must be a real calendar date.
- `people` and `balances` must be non-empty arrays.
- Every `externalId` must be a UUID; `code`, `fullName` and `accountCode` are required where applicable.
- NIC values must match `/^(\d{9}[VX]|\d{12})$/`; phone values must match `/^(\+94|94|0)\d{9}$/`.
- `debit` and `credit` are decimal strings with at most two fractional digits and no sign. Exactly one must be present per balance row.
- Total debits must equal total credits.
- `externalId` plus `personType` must be unique across `people`.
- Validation errors never include names, NICs, phone numbers or legacy codes.

## Ordering

1. Validate the manifest locally. No network calls are made.
2. Build a plan with three ordered phases: `personUpserts`, `partyUpserts`, then `openingJournal`.
3. In apply mode, POST people to `/persons`, then parties to `/parties`, then the single balanced opening entry to `/journal-entries/opening`.
4. Account codes are resolved to account IDs from `GET /accounts/tree` immediately before the journal POST. Party IDs are taken from the `/parties` responses.
5. Individual row failures are recorded and processing continues. A failed party or account lookup prevents the journal POST rather than posting an unbalanced or unlinked entry. The command exits non-zero and prints a failure summary when any row fails.

## Idempotency

`stableKey(parts)` is SHA-256 over canonical JSON (recursively sorted object keys, unchanged array order). Plan keys are derived only from `environment`, `asOfDate`, the UUID, `personType`, `accountCode` and the balance line index. Names, NICs, phones, legacy codes and descriptions are never key inputs, and passing an object with a sensitive field name to `stableKey` throws.

Every person, party and journal POST carries an `Idempotency-Key` header. The accounts endpoints deduplicate on this key, so safely rerunning an apply that did not reach the journal phase will not duplicate parties. people-service currently generates its own person IDs and does not deduplicate on this header, so check the apply result's `personIdMap` and the target database before replaying a partially applied run.

## Commands

Validate the example manifest (the default mode):

```bash
node tools/data-migration/migrate.mjs --manifest tools/data-migration/migration.example.json --validate
```

Print a redacted plan without any network calls:

```bash
node tools/data-migration/migrate.mjs --manifest tools/data-migration/migration.example.json --dry-run
```

Emit machine-readable output and write the same JSON to a file:

```bash
node tools/data-migration/migrate.mjs --manifest tools/data-migration/migration.example.json --dry-run --json --out migration-plan.json
```

Apply through the gateway with a short-lived token held in an environment variable:

```bash
DATA_MIGRATION_TOKEN='...' node tools/data-migration/migrate.mjs --manifest tools/data-migration/production.json --apply --people-url https://gateway.example/people --accounts-url https://gateway.example/accounts --token-env DATA_MIGRATION_TOKEN --json --out migration-result.json
```

`--apply` requires both service URLs and `--token-env`. The named variable must contain a bearer token with `ledger:opening`, `coa:read`, `coa:create` and the people-service write permission. Non-local `http://` URLs are refused unless `DATA_MIGRATION_ALLOW_INSECURE=1` is set; use that only for a local development stack. The token value, request bodies and response bodies are never printed or written to `--out`.

## PII safety

- Validate and dry-run output contains counts, totals, UUIDs and hashes only.
- Person details in dry-run output pass through `redactPerson`: NIC and any phone fields (including nested `smsPhone`) are removed, names are masked, and legacy codes are omitted.
- Error output identifies rows by array index and field name, never by value.
- Failed HTTP responses are reported as status codes or error class names; response bodies are discarded.
- Manifests remain sensitive files: store them in an access-controlled location and delete or archive them under the approved retention policy after sign-off.

## Verification

Use `docs/runbooks/data-migration.md` for the operational sequence. At minimum:

- Confirm validation and dry-run totals match the signed-off source totals.
- Confirm `GET /accounts/parties?partyType=SUPPLIER` and `?partyType=EMPLOYEE` return one row per manifest person with matching `externalId` and legacy `code`.
- Confirm the posted opening entry is `POSTED` with `sourceType=OPENING`, matching debit/credit totals, and `GET /accounts/integrity` reports `balanced: true`.
- Keep the `--out` result JSON with the run ticket; it contains the legacy-externalId to people-service-personId map and the failure summary.

## Rollback

The migration writes no raw database rows. To undo an applied opening entry, use the accounts-service reversal endpoint (`POST /journal-entries/:id/reverse`) with an approved reason, after closing the affected period if required by the runbook. Party and person rows are master data and are normally retained; if a pilot must be removed, use the owning service's documented delete/deactivate flow. Do not edit service schemas or shared tables directly.
