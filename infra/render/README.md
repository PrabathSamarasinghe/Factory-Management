# Render environments

`render.yaml` provisions the Phase 1 Render footprint for `dev`, `staging` and
`prod`. It contains the project environments, paid Postgres instances, Render Key
Value (Redis), private networking settings and shared environment groups.

Application services are added in Phase 1. This directory currently defines the
data tier and the configuration/secrets layout so the first services can attach
without redesigning the environments.

## Topology

| Environment | Render project env | Postgres instances                                                                      | Redis   |
| ----------- | ------------------ | --------------------------------------------------------------------------------------- | ------- |
| `dev`       | `galatura/dev`     | `galatura-dev-core-db` (shared), `galatura-dev-identity-db`, `galatura-dev-accounts-db` | `256mb` |
| `staging`   | `galatura/staging` | `galatura-staging-*`                                                                    | `256mb` |
| `prod`      | `galatura/prod`    | `galatura-prod-*`                                                                       | `1g`    |

- `identity` and `accounts` have dedicated Postgres instances from day one.
- All other services share the core instance but get their own logical database
  and login role. A service role cannot connect to another service's database.
- Postgres and Key Value use `ipAllowList: []`, so they are reachable only over
  Render's private network.
- Every environment has `networking.isolation: enabled`, which blocks private
  traffic across environment boundaries.
- `prod` has `permissions.protection: enabled`; only workspace admins can make
  destructive changes or view production secrets.

### Workspace plan

A Render project supports three environments on a **Pro** workspace. Hobby
workspaces allow at most two environments per project, so upgrade before the
first sync or temporarily remove one environment from the Blueprint. Paid
compute plans are used even on Hobby; the environment limit is separate from the
instance plan.

## First-time setup

1. Connect the GitHub repository to Render.
2. Create a new Blueprint and select the `main` branch.
3. Set the Blueprint path to `infra/render/render.yaml`.
4. Apply the Blueprint. Render creates the `galatura` project with `dev`,
   `staging` and `prod`.
5. After the databases are available, run the core database bootstrap below.
6. Add the application services in Phase 1 using the template below.

All database and Redis names are prefixed with the environment because Render
resource names are unique across the whole workspace.

## Core database and roles

Render creates **one** database and **one** login role per Postgres instance. The
core instance therefore needs a bootstrap step to create the per-service
databases and roles:

| Service                | Database                | Role                   |
| ---------------------- | ----------------------- | ---------------------- |
| `people-service`       | `galatura_people`       | `people_service`       |
| `attendance-service`   | `galatura_attendance`   | `attendance_service`   |
| `fleet-service`        | `galatura_fleet`        | `fleet_service`        |
| `collection-service`   | `galatura_collection`   | `collection_service`   |
| `notification-service` | `galatura_notification` | `notification_service` |
| `realtime-service`     | `galatura_realtime`     | `realtime_service`     |
| `inventory-service`    | `galatura_inventory`    | `inventory_service`    |
| `reporting-service`    | `galatura_reporting`    | `reporting_service`    |

The core instance's default role (`core_owner`) is for provisioning and
operations only. Never give it to an application service.

### Run the bootstrap

Because public access is disabled, run this from a Render private service or
job with `psql` installed. For a one-off bootstrap you can temporarily add your
IP address to the core database's allow list in the Render Dashboard, then remove
it immediately afterwards.

Generate one hex password per service (hex avoids URL-encoding problems):

```bash
export CORE_DATABASE_URL='postgresql://core_owner:<owner-password>@<internal-host>:5432/galatura_core'
export PEOPLE_DB_PASSWORD="$(openssl rand -hex 32)"
export ATTENDANCE_DB_PASSWORD="$(openssl rand -hex 32)"
export FLEET_DB_PASSWORD="$(openssl rand -hex 32)"
export COLLECTION_DB_PASSWORD="$(openssl rand -hex 32)"
export NOTIFICATION_DB_PASSWORD="$(openssl rand -hex 32)"
export REALTIME_DB_PASSWORD="$(openssl rand -hex 32)"
export INVENTORY_DB_PASSWORD="$(openssl rand -hex 32)"
export REPORTING_DB_PASSWORD="$(openssl rand -hex 32)"

psql "$CORE_DATABASE_URL" -v ON_ERROR_STOP=1 \
  -v people_password="$PEOPLE_DB_PASSWORD" \
  -v attendance_password="$ATTENDANCE_DB_PASSWORD" \
  -v fleet_password="$FLEET_DB_PASSWORD" \
  -v collection_password="$COLLECTION_DB_PASSWORD" \
  -v notification_password="$NOTIFICATION_DB_PASSWORD" \
  -v realtime_password="$REALTIME_DB_PASSWORD" \
  -v inventory_password="$INVENTORY_DB_PASSWORD" \
  -v reporting_password="$REPORTING_DB_PASSWORD" \
  -f infra/render/provision-core-databases.sql
```

The script is safe to re-run. Re-running it rotates the service role passwords,
so update the corresponding Render secrets immediately afterwards.

Build each service's `DATABASE_URL` with its own role and database, for example:

```text
postgresql://people_service:<people-password>@<internal-host>:5432/galatura_people
```

Store it as a service secret in Render. Do **not** use the core instance's
`fromDatabase.connectionString`: that is the `core_owner` connection.

For `identity` and `accounts`, the instance is dedicated, so the Blueprint can
use `fromDatabase` for `DATABASE_URL`.

## Environment groups and secrets

Each environment has two groups:

| Group                             | Contents                                                                      |
| --------------------------------- | ----------------------------------------------------------------------------- |
| `galatura-<env>-config`           | Non-secret values: `APP_ENV`, `NODE_ENV`, `LOG_LEVEL`, OTel attributes.       |
| `galatura-<env>-platform-secrets` | Generated `PLATFORM_MASTER_KEY` and `PLATFORM_BLIND_INDEX_KEY`, plus key ids. |

Rules:

- Attach both groups to every service.
- Never share a group across environments; each environment has its own
  generated keys.
- Service-specific values such as JWT keys, Firebase service-account JSON, SMS
  and FCM credentials are **not** committed. Add them as service-level
  `sync: false` variables during the initial Blueprint creation, or set them in
  the Render Dashboard afterwards. Render ignores `sync: false` inside an
  environment group.
- Never put a secret in `render.yaml`, `.env.example`, logs or git.
- Rotate credentials according to `docs/infrastructure.md`; generated platform
  keys must be rewrapped before the old `PLATFORM_MASTER_KEY_ID` is retired.

## Service template

Add service blocks inside the relevant environment's `services` list. Do not
duplicate a service definition in more than one environment. Use environment
prefixes in names because names are workspace-wide.

```yaml
- name: galatura-dev-gateway
  type: web
  runtime: docker
  plan: 0.5c-512mb
  region: singapore
  branch: main
  dockerfilePath: ./services/gateway/Dockerfile
  dockerContext: .
  healthCheckPath: /healthz
  maxShutdownDelaySeconds: 120
  autoDeployTrigger: checksPass
  envVars:
    - fromGroup: galatura-dev-config
    - fromGroup: galatura-dev-platform-secrets
    - key: DATABASE_URL
      sync: false
    - key: REDIS_URL
      fromService:
        type: keyvalue
        name: galatura-dev-redis
        property: connectionString
    - key: OTEL_SERVICE_NAME
      value: gateway
```

For `identity` and `accounts`, replace the `DATABASE_URL` entry with:

```yaml
- key: DATABASE_URL
  fromDatabase:
    name: galatura-dev-identity-db
    property: connectionString
```

Use `type: pserv` for private services, `type: worker` for background workers
and `type: cron` for scheduled jobs. Only the gateway and realtime service are
public (`type: web`). Everything else stays private.

### Deploy behaviour

- `dev` and `staging`: `autoDeployTrigger: checksPass`, branch `main`.
- `prod`: `autoDeployTrigger: off`. CI builds and scans the image, then an
  operator deploys the immutable `ghcr.io/galatura/<service>@sha256:<digest>`
  after approval. A prod service that pulls a prebuilt image uses:

```yaml
runtime: image
image:
  url: ghcr.io/galatura/gateway@sha256:<digest>
  creds:
    fromRegistryCreds:
      name: ghcr-galatura
autoDeployTrigger: off
```

`autoDeployTrigger` has no effect for image-based services; production deploys
are always manual. Rollback is redeploying the previous digest.

Run `prisma migrate deploy` as a `preDeployCommand`, never on application start,
and keep the expand/contract migration rules from `docs/infrastructure.md`.

## Networking

- Postgres and Key Value are private. Internal hostnames are available from the
  Render Dashboard and through `fromDatabase`/`fromService` references.
- Use `*.internal` endpoints for service-to-service calls.
- `dev`, `staging` and `prod` cannot reach each other over the private network.
- Public ingress is limited to the gateway and realtime service, added in Phase 1.
- Heartbeat WebSocket connections and verify Render's current idle timeout when
  the realtime service is added.

## Backups and recovery

- Paid Render Postgres includes continuous PITR: 7 days on the Pro workspace
  required here (3 days if the workspace is downgraded to Hobby).
- Schedule logical exports for long-term retention/off-platform copies; Render
  keeps exports for 7 days.
- Rehearse the `accounts` restore early. Do not restore production data into
  `dev` or `staging`; use anonymised snapshots only.
- Redis persistence is not a substitute for a queue backup; BullMQ jobs must be
  idempotent and replayable from the outbox.
- Free Postgres/Key Value plans have no recovery; do not change any plan to
  `free`.

## Validation

- Format: `pnpm exec prettier --check infra/render`
- Render CLI v2.7 or later:
  `render blueprints validate infra/render/render.yaml`
- IDE/schema: `https://render.com/schema/render.yaml.json`
- Confirm no free plans:
  `Select-String -Path infra/render/render.yaml -Pattern 'plan:\s*free'`
  (PowerShell) or `grep -nE 'plan:\s*free' infra/render/render.yaml`.

The Render Blueprint sync is the final validation. A sync failure is a defect;
fix the YAML rather than making undocumented console changes.
