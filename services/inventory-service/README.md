# Inventory service

Inventory master data, stock movements, and valuation backend for Phase 8.

The service owns categories, units, items, warehouses, locations, vendors, goods receipts, goods issues, transfers, adjustments, stock takes, balances, and immutable stock movements. Other services consume `inventory.purchase.received` and `inventory.issue.posted` events through the outbox.

## Configuration

- `DATABASE_URL` — required PostgreSQL connection string for the `inventory` schema.
- `DATABASE_POOL_MAX` — optional pool size, default `5`.
- `PORT` — optional HTTP port, default `3009`.
- `INVENTORY_INGEST_TOKEN` — optional shared token required on `/events/ingest` via `x-service-token`.
- `PLATFORM_MASTER_KEY` — required 32-byte base64/hex key used to encrypt vendor bank details.

## Validation

```bash
pnpm --filter @galatura/inventory-service prisma:generate
pnpm --filter @galatura/inventory-service typecheck
pnpm --filter @galatura/inventory-service test
pnpm --filter @galatura/inventory-service build
```

## Invariants

- Documents are created as drafts; approval is the only operation that applies stock.
- Create, approve, and complete endpoints are idempotent by `Idempotency-Key`.
- Stock movements are append-only and blocked from UPDATE/DELETE by database triggers.
- Quantities use decimal strings with at most three places; money uses two.
- Weighted average cost is recalculated on every inbound movement.
- Vendor bank details are encrypted at rest and returned only as the last four characters.
