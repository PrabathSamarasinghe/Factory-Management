# Reporting service

Read-only reporting projections and monitor APIs for Phase 9.

The service consumes events from other services and maintains `rpt_daily_summary`, `rpt_trip_live`, `rpt_supplier_daily`, `rpt_finance_snapshot`, and `rpt_inventory_snapshot` in the `reporting` schema. It never queries other services for live reads and does not publish domain events.

## Configuration

- `DATABASE_URL` — required PostgreSQL connection string for the `reporting` schema.
- `DIRECT_URL` — optional migration connection string; falls back to `DATABASE_URL`.
- `DATABASE_POOL_MAX` — optional pool size, default `5`.
- `PORT` — optional HTTP port, default `3010`.
- `REPORTING_INGEST_TOKEN` — optional shared token required on `/events/ingest` via `x-service-token`.

## API

- `POST /events/ingest` — accepts event envelopes with `monitor:read` or a valid service token.
- `GET /monitor/today` — daily dashboard totals (`monitor:read`).
- `GET /monitor/trips` — active and recently ended trips (`monitor:read`).
- `GET /monitor/attendance?date=` — daily attendance summary (`monitor:read`).
- `GET /monitor/collections?date=` — supplier collections and totals (`monitor:read`).
- `GET /monitor/finance` — finance snapshot and net cash (`monitor:finance`).
- `GET /monitor/inventory` — inventory snapshot (`monitor:read`).
- `GET /monitor/rebuild` — rebuild status stub (`monitor:read`).
- `GET /health` — liveness probe, no permission required.

All responses are wrapped in `{ "data": ... }`.

## Validation

```bash
pnpm --filter @galatura/reporting-service prisma:generate
pnpm --filter @galatura/reporting-service typecheck
pnpm --filter @galatura/reporting-service test
pnpm --filter @galatura/reporting-service build
```

## Invariants

- Event ingestion is idempotent per consumer and event id.
- Unknown and `account.created` events are recorded as ignored but processed.
- Projection rows keep the last 50 source event ids as `{ id, type, occurredAt }`.
- Money is returned with two decimals and quantities with three decimals.
- Finance projections require `monitor:finance`; rebuild is a non-destructive stub.
