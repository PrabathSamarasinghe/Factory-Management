# Accounts service

Dedicated accounting, payroll, and payments ledger service for Phase 7.

It is the only service allowed to write balances, journal entries, supplier bills, payroll runs, and payments. Other services emit `collection.finalized` and `attendance.day.closed` events to `/events/ingest`; they never write ledger data directly.

## Configuration

- `DATABASE_URL` — required PostgreSQL connection string for the `accounts` schema.
- `DATABASE_POOL_MAX` — optional pool size, default `5`.
- `PORT` — optional HTTP port, default `3008`.
- `ACCOUNTS_INGEST_TOKEN` — optional shared token required on `/events/ingest` via `x-service-token`.
- `PLATFORM_MASTER_KEY` — required 32-byte base64/hex key used to encrypt company bank account numbers.

## Validation

```bash
pnpm --filter @galatura/accounts-service prisma:generate
pnpm --filter @galatura/accounts-service typecheck
pnpm --filter @galatura/accounts-service test
pnpm --filter @galatura/accounts-service build
```

## Invariants

- Every journal entry must be balanced before posting.
- Posted journal lines are immutable at the database trigger level.
- Reversals are idempotent and never mutate the original entry lines.
- Posting commands require an `Idempotency-Key`.
- Trial balance must always report `balanced: true`.
- Bank account numbers are stored encrypted and returned only masked.
