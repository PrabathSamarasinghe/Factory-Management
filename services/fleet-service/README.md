# Fleet Service

NestJS service for lorries, statutory documents, maintenance, routes, route
stops, effective-dated assignments, trips and trip events.

## Configuration

| Variable                 | Default                 | Purpose                                  |
| ------------------------ | ----------------------- | ---------------------------------------- |
| `PORT`                   | `3004`                  | HTTP port                                |
| `DATABASE_URL`           | required                | PostgreSQL connection string             |
| `DATABASE_POOL_MAX`      | `5`                     | Maximum Prisma pool connections          |
| `COLLECTION_SERVICE_URL` | `http://localhost:3005` | Base URL for final collection readiness  |
| `COLLECTION_TIMEOUT_MS`  | `5000`                  | Collection readiness timeout             |
| `FLEET_ALERT_DAYS`       | `30`                    | Days window for due-soon document alerts |
| `FLEET_ALERT_KM`         | `1000`                  | Kilometre window for maintenance alerts  |

All endpoints are mounted under `/api/v1/fleet` by the gateway. The service
also listens on its own `/api/v1/fleet` prefix when run directly.

## Permissions

Requests must supply `x-permissions` as a JSON array. The service checks:

- `lorry:read`, `lorry:create`, `lorry:update`
- `route:read`, `route:create`, `route:update`
- `assignment:read`, `assignment:create`, `assignment:change`
- `trip:read`, `trip:read-own`, `trip:create`, `trip:update`, `trip:end`,
  `trip:cancel`

`x-user-id` is required for create/update/change/start/end operations. Identity
migration `20261118020000_fleet_permissions` seeds these codes and grants them
to the `ADMIN` role.

## Main endpoints

- `GET/POST /lorries`, `GET/PATCH /lorries/:id`
- `POST /lorries/:id/documents`, `POST /lorries/:id/maintenance`
- `GET /lorries/alerts`
- `GET/POST /routes`, `GET/PATCH /routes/:id`, `PUT /routes/:id/stops`
- `GET/POST /assignments`, `POST /assignments/:id/change`
- `GET/POST /trips`, `GET /trips/mine/today`, `GET /trips/:id`
- `POST /trips/:id/events`, `POST /trips/:id/arrive-factory`,
  `POST /trips/:id/end`, `POST /trips/:id/cancel`
- `GET /drivers`, `GET /suppliers`, `GET /materials`, `GET /weighbridges`

## Operational notes

- Trip start is idempotent on `clientTripId` and rejects a start odometer below
  the lorry’s current odometer.
- Trip end requires `AT_FACTORY` or `WEIGHING` status and a finalised collection
  response from the collection service. Failures are fail-closed.
- Assignment changes close the current row with `ENDED` and create a new active
  row linked by `previousAssignmentId`.
- Fleet audit records and outbox events are written in the same transaction as
  the business change where applicable.
- The migration requires `btree_gist` for the lorry assignment overlap
  exclusion constraint.

## Validation

```powershell
pnpm --filter @galatura/fleet-service prisma:generate
pnpm --filter @galatura/fleet-service exec prisma migrate deploy
pnpm --filter @galatura/fleet-service typecheck
pnpm --filter @galatura/fleet-service test
pnpm --filter @galatura/fleet-service build
```
