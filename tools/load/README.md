# Load test toolkit

Dependency-free Node 24 load-test artifacts for the gateway. The toolkit uses only Node built-ins and never reads or prints request/response bodies or token values.

## Commands

```bash
node tools/load/load-test.mjs --scenario tools/load/scenarios/weighing-peak.json --dry-run
node tools/load/load-test.mjs --scenario tools/load/scenarios/weighing-peak.json \
  --run --base-url https://staging-gateway.example.test --token-env LOAD_TEST_TOKEN
node --test tools/load/lib.test.mjs
pnpm exec prettier --check tools/load docs/load-testing.md
```

`--dry-run` is the default when `--run` is absent. A dry run validates the scenario and prints the planned workload; it makes no network requests. `--run` executes the test and exits 1 when any threshold fails.

## Flags

| Flag                     | Value                 | Purpose                                                                                                      |
| ------------------------ | --------------------- | ------------------------------------------------------------------------------------------------------------ |
| `--scenario <path>`      | required              | Path to a JSON scenario file.                                                                                |
| `--base-url <url>`       | required with `--run` | Gateway origin, for example `https://staging-gateway.example.test`. No path, query, fragment or credentials. |
| `--dry-run`              | boolean               | Validate and print the plan without network traffic. Default unless `--run` is given.                        |
| `--run`                  | boolean               | Execute the workload. Requires `targetEnv: "staging"`.                                                       |
| `--concurrency <n>`      | integer 1–1000        | Override the measured-phase concurrency.                                                                     |
| `--duration-seconds <n>` | integer 1–86400       | Override the measured-phase duration.                                                                        |
| `--token-env <name>`     | uppercase env name    | Read `Bearer` token from this environment variable. The value is never logged or written to the report.      |
| `--json`                 | boolean               | Print machine-readable JSON instead of the human summary.                                                    |
| `--out <path>`           | path, `--run` only    | Write the full JSON report to this path.                                                                     |

Long flags also accept `--flag=value`.

## Scenario schema

All top-level fields are required. Unknown fields are rejected.

```json
{
  "name": "Scenario name",
  "description": "What this workload simulates",
  "targetEnv": "staging",
  "basePath": "/api/v1",
  "warmup": { "durationSeconds": 10, "concurrency": 5 },
  "requests": [
    {
      "name": "unique-request-name",
      "method": "GET",
      "path": "/api/v1/collection/trips/{{tripId}}/readiness",
      "weight": 20,
      "headers": { "Accept": "application/json" },
      "expectedStatus": 200
    }
  ],
  "thresholds": {
    "durationSeconds": 120,
    "concurrency": 25,
    "maxErrorRatePct": 0.5,
    "maxP95Ms": 300,
    "minRequests": 1000
  }
}
```

| Field                       | Rules                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `name`, `description`       | Non-empty strings without control characters.                                                                                        |
| `targetEnv`                 | `local` or `staging`; `--run` requires `staging`.                                                                                    |
| `basePath`                  | Shared gateway prefix, `/api/v1` or an `/api/v1/...` path with no trailing slash, query or fragment.                                 |
| `warmup.durationSeconds`    | Integer 0–86400. Warmup samples are discarded.                                                                                       |
| `warmup.concurrency`        | Integer 1–1000.                                                                                                                      |
| `requests`                  | 1–50 entries with unique `name` values.                                                                                              |
| `requests[].method`         | Uppercase `GET`, `POST`, `PATCH`, `PUT` or `DELETE`.                                                                                 |
| `requests[].path`           | Starts with `basePath + "/"`; no trailing slash, fragment, whitespace or sensitive query key.                                        |
| `requests[].weight`         | Positive finite number no greater than 1000; selection is cumulative-weight deterministic.                                           |
| `requests[].headers`        | Optional string map. `Authorization`, cookies, API keys, tokens, secrets, passwords and credentials are rejected; use `--token-env`. |
| `requests[].body`           | Optional JSON object template. Token/password/secret keys are rejected.                                                              |
| `requests[].expectedStatus` | Optional 2xx code. Without it, any 2xx/3xx status counts as success.                                                                 |
| `thresholds`                | `durationSeconds` 1–86400, `concurrency` 1–1000, `maxErrorRatePct` 0–100, `maxP95Ms` 0–600000, `minRequests` 1–10000000.             |

## Placeholder substitution

Placeholders use `{{camelCaseName}}` in paths, header values and body string values. For each placeholder, the toolkit first checks `LOAD_TEST_<UPPER_SNAKE_CASE_NAME>`, for example `{{tripId}}` maps to `LOAD_TEST_TRIP_ID` and `{{faceFrameBase64}}` maps to `LOAD_TEST_FACE_FRAME_BASE64`. If the environment variable is unset, the fallback below is used.

| Placeholder                                                              | Generated fallback                                                                                               |
| ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| `tripId`, `supplierId`, `pickupId`, `deviceId`, `personId`, `locationId` | One UUID per test run. Set the env var to target seeded staging data.                                            |
| `clientWeighingId`, `clientPickupId`, `clientEventId`, `clientSyncId`    | A fresh UUID per request attempt, keeping idempotency keys unique.                                               |
| `date`                                                                   | Current UTC date, `YYYY-MM-DD`.                                                                                  |
| `since`                                                                  | ISO timestamp one hour before the run.                                                                           |
| `weighedAt`, `sentAt`, `capturedAt`, `eventAt`                           | Current ISO timestamp.                                                                                           |
| `channel`                                                                | `weighing.live`.                                                                                                 |
| `faceFrameBase64`                                                        | No generated value; `LOAD_TEST_FACE_FRAME_BASE64` is required for `--run` when attendance marking is in the mix. |

Reports contain only placeholder sources (`env` or `generated`), never the substituted values.

## Safety rules

- Run only against staging, or a local gateway for development. Production scenarios are rejected.
- Prefer HTTPS. Non-local HTTP is refused unless `LOAD_TEST_ALLOW_INSECURE=1` is set for an approved staging tunnel.
- Store tokens only in environment variables and pass the variable name with `--token-env`.
- Never put tokens, real biometrics, phone numbers, NIC/passport numbers, bank details or real supplier/customer data in a scenario file.
- Scenario headers and body templates are validated; report headers are redacted with `redactHeaders`.
- Request and response bodies are never logged, even on errors.
- Use an isolated staging tenant and synthetic/anonymised fixtures. Writes are real staging writes, including weighings, finalisations, sync batches and attendance events.
- Stop the run if the gateway or a dependency shows sustained errors, pool saturation, DLQ growth or unexpected business rejections.

## Report interpretation

| Field                                                   | Meaning                                                                                                                                                                            |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `totalRequests`, `successfulRequests`, `failedRequests` | Counts from the measured phase only; warmup is excluded.                                                                                                                           |
| `errorRatePct`                                          | Failed requests divided by total requests. A sample with a non-expected status or a fetch error is a failure.                                                                      |
| `p95Ms`, `p95Basis`                                     | Nearest-rank p95 of successful requests. If any successful `GET` samples exist, the basis is `read` and the p95 threshold is evaluated on those reads only; otherwise it is `all`. |
| `overallP95Ms`                                          | Nearest-rank p95 across every successful request, including writes.                                                                                                                |
| `statusCounts`, `byRequest`                             | Aggregate status codes and per-request counts/latencies.                                                                                                                           |
| `samples`                                               | Per-request latency, status, success flag and sanitised error message. No bodies.                                                                                                  |
| `headers`                                               | Redacted union of scenario headers plus injected auth header.                                                                                                                      |
| `thresholds`                                            | Configured limits, observed values and pass flags.                                                                                                                                 |
| `failures`, `passed`                                    | Explicit threshold failures and the overall result.                                                                                                                                |

`formatSummary(report)` renders the same information for a terminal. With `--json`, stdout is a single JSON document suitable for CI. With `--out`, the same JSON document is written to the requested file.
