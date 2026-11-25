# Recovery Tooling

This directory contains dependency-free Phase 10.3 backup and restore artifacts built with Node built-ins and PostgreSQL client tooling. Supabase is the authoritative database tier; Render Postgres backup guidance is legacy.

## Files

| File                              | Purpose                                                        |
| --------------------------------- | -------------------------------------------------------------- |
| `backup-manifest.example.json`    | Example backup/DR inventory for `prod`, `staging` and `dev`    |
| `verify-backup-manifest.mjs`      | Validates manifest freshness, policy fields and secret hygiene |
| `verify-backup-manifest.test.mjs` | `node:test` coverage for the validator and JSON output         |
| `verify-restore.sql`              | Read-only restore verification queries for `psql`              |

## Usage

```bash
node tools/recovery/verify-backup-manifest.mjs --manifest tools/recovery/backup-manifest.example.json --strict
node tools/recovery/verify-backup-manifest.mjs --manifest tools/recovery/backup-manifest.example.json --as-of 2026-11-25T12:00:00Z --json
node --test tools/recovery/verify-backup-manifest.test.mjs
pnpm exec prettier --check docs/runbooks tools/recovery
```

Flags:

| Flag         | Default                                       | Meaning                                      |
| ------------ | --------------------------------------------- | -------------------------------------------- |
| `--manifest` | `tools/recovery/backup-manifest.example.json` | Path to the manifest JSON                    |
| `--as-of`    | current UTC time                              | ISO date used for freshness checks           |
| `--json`     | off                                           | Emit a machine-readable report               |
| `--strict`   | off                                           | Exit 1 when any check is `overdue` or `fail` |

Status values are `ok`, `due`, `overdue` and `fail`. `due` is an early-warning state inside the final 20% of a freshness window and does not fail strict mode. `overdue` and `fail` do. All printed values are redacted; keep real secrets out of `notes` and out of the manifest.

Run the restore verification script with `psql`; it uses `format('%I')` and `\gexec` for safe identifier quoting and contains no data-changing statements:

```bash
psql "$RESTORE_DB_URL" -v ON_ERROR_STOP=1 -f tools/recovery/verify-restore.sql
```

It checks schema inventory, row counts for core tables that exist, journal balance, immutability triggers, duplicate party/user keys and the latest `_prisma_migrations` rows.

## Manifest schema

```json
{
  "version": 1,
  "environments": {
    "prod": {
      "provider": "supabase",
      "projectRef": "prodprojectref00000001",
      "database": "postgres",
      "schemas": ["identity", "accounts"],
      "pitrEnabled": true,
      "pitrWindowHours": 168,
      "logicalExportSchedule": "15 2 * * *",
      "encryption": true,
      "retentionDays": 90,
      "lastSuccessfulBackupAt": "2026-11-25T11:00:00.000Z",
      "lastRestoreDrillAt": "2026-11-01T09:00:00.000Z",
      "owner": "platform-ops",
      "notes": "No credentials in this manifest."
    }
  }
}
```

| Field                    | Type       | Validation                                         |
| ------------------------ | ---------- | -------------------------------------------------- |
| `version`                | number     | Documented schema version; currently `1`           |
| `environments`           | object     | Must contain `prod`, `staging` and `dev`           |
| `provider`               | string     | Required, non-empty; use `supabase`                |
| `projectRef`             | string     | Required, non-empty; unique per environment        |
| `database`               | string     | Required, non-empty; normally `postgres`           |
| `schemas`                | string[]   | Required, non-empty; list the service schemas      |
| `pitrEnabled`            | boolean    | Required; must be `true` for `staging` and `prod`  |
| `pitrWindowHours`        | number     | Required; at least `24`                            |
| `logicalExportSchedule`  | string     | Required, non-empty; UTC cron schedule             |
| `encryption`             | boolean    | Required; must be `true`                           |
| `retentionDays`          | number     | Required; at least `30`                            |
| `lastSuccessfulBackupAt` | ISO string | Within 24 h for `prod`, 7 days for `staging`/`dev` |
| `lastRestoreDrillAt`     | ISO string | Within 90 days                                     |
| `owner`                  | string     | Required, non-empty                                |
| `notes`                  | string     | Required; scanned for unredacted secrets           |

## Drill workflow

1. Update the operator manifest with real project refs, timestamps and drill results.
2. Run the validator in strict mode before the drill.
3. Follow `docs/runbooks/restore-drill.md`; restore `accounts` first into quarantine.
4. Run `verify-restore.sql` against the restored target and save the output.
5. Record actual data-loss window and elapsed time against RPO/RTO targets.
6. Sign off with the incident commander, accounts owner, security/privacy lead and approver.
7. Open corrective tasks for any failure and repeat the failed scenario within 30 days.

Never restore production data to `dev` or `staging` without anonymisation. Biometric data is never copied outside the production boundary.

## CI suggestion

Run the non-strict check on a schedule so `due` states are visible, and the strict check on manual release or DR-review workflows.

```yaml
name: backup-manifest
on:
  schedule:
    - cron: '0 4 * * *'
  workflow_dispatch:
jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version-file: .nvmrc
      - run: node tools/recovery/verify-backup-manifest.mjs --strict
      - run: node --test tools/recovery/verify-backup-manifest.test.mjs
```

Use an operator-controlled manifest in CI rather than committing real timestamps or project details that should not be public.
