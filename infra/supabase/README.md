# Supabase PostgreSQL

Phase 1 uses **Supabase Postgres** as the database tier. There is one Supabase
project per environment (`dev`, `staging`, `prod`), and one **database schema plus
login role per database-owning service** inside each project. Services never
share a schema and never query another service's tables.

Render remains the application and Redis host. Supabase is not provisioned by
`render.yaml`; it is created once per environment in the Supabase dashboard.

## Topology

| Environment | Supabase project | Database | Schemas |
| ----------- | ---------------- | -------- | ------- |
| `dev`       | `<dev-project>`  | `postgres` | one per service |
| `staging`   | `<staging-project>` | `postgres` | one per service |
| `prod`      | `<prod-project>` | `postgres` | one per service |

The dashboard project reference is part of every pooler username
(`<role>.<project-ref>`). Do not share one project across environments: secrets,
PITR, and data classification must stay separate.

| Service                | Schema         | Role                   |
| ---------------------- | -------------- | ---------------------- |
| `identity-service`     | `identity`     | `identity_service`     |
| `people-service`       | `people`       | `people_service`       |
| `attendance-service`   | `attendance`   | `attendance_service`   |
| `fleet-service`        | `fleet`        | `fleet_service`        |
| `collection-service`   | `collection`   | `collection_service`   |
| `notification-service` | `notification` | `notification_service` |
| `realtime-service`     | `realtime`     | `realtime_service`     |
| `accounts-service`     | `accounts`     | `accounts_service`     |
| `inventory-service`    | `inventory`    | `inventory_service`    |
| `reporting-service`    | `reporting`    | `reporting_service`    |

`gateway` has no database. Prisma's `_prisma_migrations` table lives in the
service's own schema because each service declares only its schema in
`schema.prisma`.

## First-time provisioning

1. Create the Supabase project in the region closest to the factory. Use the
   same region as the Render services where possible.
2. Copy the **Session pooler** connection string from **Connect**. It uses port
   `5432` and is reachable over IPv4. Use it for migrations and provisioning.
3. Generate one long random password per service. Hex passwords avoid URL
   encoding problems:
   - Git Bash/macOS/Linux: `openssl rand -hex 32`
   - PowerShell:
     `$b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToHexString($b).ToLower()`
4. Run `provision-schemas.sql` as the Supabase `postgres` role. Pass every
   password as a psql variable; never edit passwords into the SQL file:

   ```bash
   export SUPABASE_DB_URL='postgresql://postgres.<project-ref>:<postgres-password>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require'

   export IDENTITY_DB_PASSWORD="$(openssl rand -hex 32)"
   export PEOPLE_DB_PASSWORD="$(openssl rand -hex 32)"
   export ATTENDANCE_DB_PASSWORD="$(openssl rand -hex 32)"
   export FLEET_DB_PASSWORD="$(openssl rand -hex 32)"
   export COLLECTION_DB_PASSWORD="$(openssl rand -hex 32)"
   export NOTIFICATION_DB_PASSWORD="$(openssl rand -hex 32)"
   export REALTIME_DB_PASSWORD="$(openssl rand -hex 32)"
   export ACCOUNTS_DB_PASSWORD="$(openssl rand -hex 32)"
   export INVENTORY_DB_PASSWORD="$(openssl rand -hex 32)"
   export REPORTING_DB_PASSWORD="$(openssl rand -hex 32)"

   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 \
     -v identity_password="$IDENTITY_DB_PASSWORD" \
     -v people_password="$PEOPLE_DB_PASSWORD" \
     -v attendance_password="$ATTENDANCE_DB_PASSWORD" \
     -v fleet_password="$FLEET_DB_PASSWORD" \
     -v collection_password="$COLLECTION_DB_PASSWORD" \
     -v notification_password="$NOTIFICATION_DB_PASSWORD" \
     -v realtime_password="$REALTIME_DB_PASSWORD" \
     -v accounts_password="$ACCOUNTS_DB_PASSWORD" \
     -v inventory_password="$INVENTORY_DB_PASSWORD" \
     -v reporting_password="$REPORTING_DB_PASSWORD" \
     -f infra/supabase/provision-schemas.sql
   ```

   If `psql` is unavailable, run the same statements in the Supabase SQL editor
   while signed in as an owner, or install the PostgreSQL client. Do not paste
   real passwords into a shared query history.

5. Store each service's two URLs in the Render service's environment. The
   values are `sync: false`; they are never committed to `render.yaml`.
6. Run `prisma migrate deploy` from the release job using `DIRECT_URL`.

The provisioning script is safe to re-run. Re-running it rotates every service
password, so update Render immediately afterwards. It does not drop data,
schemas, or roles.

## Connection strings

Every service gets a **pooled runtime URL** and a **direct/session URL for
migrations**. Use the custom role in both; never use the Supabase `postgres`
role from an application.

```dotenv
# Runtime: shared transaction pooler, port 6543
DATABASE_URL="postgresql://people_service.<project-ref>:<people-password>@aws-1-ap-south-1.pooler.supabase.com:6543/postgres?pgbouncer=true&sslmode=require"

# Migrations: shared session pooler, port 5432
DIRECT_URL="postgresql://people_service.<project-ref>:<people-password>@aws-1-ap-south-1.pooler.supabase.com:5432/postgres?sslmode=require"
```

Rules:

- The shared pooler username is `<role>.<project-ref>`, not just the role name.
- Keep `pgbouncer=true` on the transaction-pooler URL; transaction mode does not
  support prepared statements.
- Use `sslmode=require`. Supabase rejects unencrypted connections.
- Set `DIRECT_URL` to the session pooler, not the IPv6-only direct host, unless
  the project has the IPv4 add-on and the runner has IPv6.
- Do not put `?schema=` in the URL. Routing is explicit: the role's
  `search_path` is its own schema, and every Prisma model declares
  `@@schema("<service>")`.
- Use Prisma 7 with `@prisma/adapter-pg`; the adapter receives the pooled URL.

Example Prisma configuration:

```ts
// services/people-service/prisma7.config.ts
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: { url: env('DIRECT_URL') },
});
```

```prisma
datasource db {
  provider = 'postgresql'
  schemas  = ["people"]
}
```

Every model and enum in that service needs `@@schema("people")`.

## Supabase settings

- The backend uses Prisma only. Disable the Supabase Data API unless a client
  feature explicitly needs it.
- Never expose a service schema through the Data API/PostgREST. Do not grant
  `anon` or `authenticated` access to service schemas.
- Do not modify Supabase-managed schemas (`auth`, `storage`, `extensions`,
  `realtime`, `vault`) or grant them to service roles. Add extension objects to
  the relevant service migration only after review.
- Enable network restrictions on paid plans where the Render egress ranges are
  stable. At minimum, keep the database password out of source control and use
  the service roles.
- Enable PITR/backups appropriate to the environment. Confirm the recovery
  window before go-live; free projects pause and are not suitable for
  `staging`/`prod`.

## Validation

- Format: `pnpm exec prettier --check infra/supabase`
- Connect as a service role and confirm `SHOW search_path` returns its schema.
- Confirm the role cannot create in another service schema.
- Run `prisma migrate status` with `DIRECT_URL` before the first deploy.
- Run `pnpm prisma:check` with a disposable CI database, never against Supabase.
