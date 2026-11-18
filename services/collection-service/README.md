# Collection Service

NestJS service for Phase 5 field collection: offline pickup sync, factory
weighing, discrepancies, finalised daily totals and the `collection.finalized`
event.

It listens on port `3005` by default. The gateway exposes it at
`/api/v1/collection`.

## Requires

- PostgreSQL with the migration in `prisma/migrations` applied.
- The gateway, identity, people and fleet services.
- Permissions from `services/identity-service/prisma/migrations/20261118030000_collection_permissions`.

## Configuration

| Variable                     | Default                 | Purpose                                    |
| ---------------------------- | ----------------------- | ------------------------------------------ |
| `DATABASE_URL`               | required                | PostgreSQL connection string               |
| `DATABASE_POOL_MAX`          | `5`                     | Prisma pool max                            |
| `PORT`                       | `3005`                  | HTTP port                                  |
| `PEOPLE_SERVICE_URL`         | `http://localhost:3001` | Supplier master-data upstream              |
| `FLEET_SERVICE_URL`          | `http://localhost:3004` | Route master-data upstream                 |
| `MASTER_DATA_TIMEOUT_MS`     | `5000`                  | Master-data upstream timeout               |
| `COLLECTION_CLOCK_SKEW_MS`   | `300000`                | Allowed device/server clock skew on push   |
| `COLLECTION_DISCREPANCY_PCT` | `2`                     | Field vs factory net discrepancy threshold |

## Endpoints

All paths are relative to `/api/v1/collection` through the gateway.

| Method | Path                                   | Permission            | Purpose                          |
| ------ | -------------------------------------- | --------------------- | -------------------------------- |
| `POST` | `/pickups`                             | `collection:record`   | Create an idempotent pickup      |
| `POST` | `/pickups/:id/correct`                 | `collection:correct`  | Supersede a pickup               |
| `GET`  | `/trips/:tripId/pickups`               | `collection:read`     | List trip pickups                |
| `GET`  | `/suppliers/:id/scan-preview`          | `collection:record`   | Supplier scan lookup             |
| `GET`  | `/reports/manual-entries`              | `collection:review`   | Typed registration-number report |
| `POST` | `/sync/push`                           | `collection:record`   | Push offline pickups             |
| `GET`  | `/sync/pull`                           | `collection:record`   | Pull server changes              |
| `GET`  | `/master-data/pull`                    | `collection:read`     | Suppliers and routes for C3      |
| `POST` | `/weighings`                           | `collection:weigh`    | Record factory weighing          |
| `GET`  | `/trips/:tripId/readiness`             | `collection:read`     | Fleet end-trip readiness         |
| `POST` | `/trips/:tripId/finalize`              | `collection:finalize` | Finalise daily totals            |
| `GET`  | `/weighings/discrepancies`             | `collection:review`   | List discrepancies               |
| `POST` | `/weighings/discrepancies/:id/resolve` | `collection:resolve`  | Resolve a discrepancy            |
| `GET`  | `/totals/daily`                        | `collection:review`   | Finalised daily totals           |
| `GET`  | `/suppliers/:id/statement`             | `collection:review`   | Supplier statement               |

## Idempotency and sync

- Pickup creation is keyed by `clientPickupId`; duplicates return the original.
- `REG_NO` pickups require `manualReason`.
- `/sync/push` accepts at most 200 items and rejects device clocks outside
  `COLLECTION_CLOCK_SKEW_MS`; accepted and rejected items are reported per item.
- `/sync/pull` returns pickups, weighings, daily totals and discrepancies changed
  after `since`, capped at 200 rows.

## Finalisation

`POST /trips/:tripId/finalize` groups all recorded pickups and weighings by
supplier and date, upserts finalised daily totals, writes an audit entry, and
appends a `collection.finalized` v1 event to the outbox in the same transaction.

## Development

```powershell
pnpm --filter @galatura/collection-service prisma:generate
pnpm --filter @galatura/collection-service typecheck
pnpm --filter @galatura/collection-service test
pnpm --filter @galatura/collection-service build
```
