# Observability configuration

This directory contains the Phase 10.6 telemetry configuration for Galatura.

- `otel-collector.yaml`: private OTel Collector receiving OTLP gRPC/HTTP and exporting logs, metrics, and traces to the configured OTLP backend. Metrics are also exposed on a private Prometheus endpoint.
- `alerts.yml`: Prometheus-compatible alert rules mapped to `docs/observability.md` SLOs and the runbook catalogue.

## Setup

- [ ] Deploy one Collector per environment inside the private network.
- [ ] Configure services to export OTLP to `OTEL_COLLECTOR_GRPC_ENDPOINT` or `OTEL_COLLECTOR_HTTP_ENDPOINT`.
- [ ] Configure the Prometheus/Mimir scraper to scrape `COLLECTOR_PROMETHEUS_ENDPOINT` from the private network only.
- [ ] Load `alerts.yml` into the alerting layer and point `runbook_url` links at the repository docs.
- [ ] Configure Alertmanager routing using the severity table below.
- [ ] Confirm dashboards and paging are tested in `staging` before `prod`.

## Environment variables

All environment-specific values in `otel-collector.yaml` use `${env:...}` placeholders. Values are supplied by the deployment environment or secret manager; none are stored in git.

| Variable                        | Example value               | Secret | Purpose                                   |
| ------------------------------- | --------------------------- | ------ | ----------------------------------------- |
| `OTEL_COLLECTOR_GRPC_ENDPOINT`  | `0.0.0.0:4317`              | No     | Private OTLP gRPC listen address          |
| `OTEL_COLLECTOR_HTTP_ENDPOINT`  | `0.0.0.0:4318`              | No     | Private OTLP HTTP listen address          |
| `DEPLOYMENT_ENVIRONMENT`        | `prod`                      | No     | `deployment.environment` resource value   |
| `SERVICE_NAMESPACE`             | `galatura`                  | No     | `service.namespace` resource value        |
| `OTLP_BACKEND_ENDPOINT`         | `otlp.example.invalid:4317` | No     | Backend OTLP endpoint                     |
| `OTLP_BACKEND_INSECURE`         | `false`                     | No     | Disable TLS only for private local tests  |
| `OTLP_BACKEND_AUTH_HEADER`      | `<backend token>`           | Yes    | Authorization header for the OTLP backend |
| `COLLECTOR_PROMETHEUS_ENDPOINT` | `0.0.0.0:9464`              | No     | Private Prometheus scrape endpoint        |
| `COLLECTOR_HEALTH_ENDPOINT`     | `0.0.0.0:13133`             | No     | Collector health endpoint                 |
| `COLLECTOR_LOG_LEVEL`           | `info`                      | No     | Collector internal log level              |

Rules:

- Never place backend tokens in `otel-collector.yaml`, environment group values visible to all services, logs, or tickets.
- Use different endpoint values and credentials per environment.
- Keep all listed endpoints private; only the gateway and realtime service are public.
- The Collector filters `/healthz`, `/readyz`, and `/metrics` traffic to keep SLO dashboards accurate.

## Validation commands

Run from the repository root:

```bash
pnpm exec prettier --check docs/user-training.md docs/sops docs/pilot-rollout.md docs/runbooks infra/observability
otelcol-contrib validate --config infra/observability/otel-collector.yaml
promtool check rules infra/observability/alerts.yml
```

If a validation tool is not installed, use the project-approved container or CI image for that tool. A format check alone does not validate Collector or PromQL syntax.

## Dashboard checklist

- [ ] Platform: up/ready, restarts, CPU, memory, DB pool, request rate, error rate, p50/p95/p99.
- [ ] Request flow: gateway errors by route, dependency latency, trace exemplars.
- [ ] Async: outbox lag, queue depth, job failures, DLQ size, consumer lag.
- [ ] Realtime: connections, connect success, reconnect rate, publish/drop rate, ticket failures.
- [ ] Business: pickups/kg, weighings, trips, SMS, attendance, payables/payments, low stock.
- [ ] Security: auth failures, lockouts, permission changes, admin actions, 401/403 spikes.
- [ ] Finance snapshot access is restricted by role.
- [ ] No PII, phone numbers, bank numbers, or biometric values are visible on shared dashboards.
- [ ] Every dashboard row links to the relevant runbook entry.

## Alert routing notes

| Severity | Route                                | Acknowledge target | Notes                                            |
| -------- | ------------------------------------ | ------------------ | ------------------------------------------------ |
| P1       | Pager immediately and `#alerts-p1`   | 5 min              | Incident commander required                      |
| P2       | Pager during hours and `#alerts-ops` | 15 min             | Raise to P1 for money, identity, or privacy risk |
| P3       | `#alerts-ops` and ticket             | 4 h                | Business hours follow-up                         |
| P4       | Dashboard/ticket/email               | 1 business day     | Review in planned operations window              |

Additional routing rules:

- Group alerts by environment, service, and route to reduce noise.
- Deduplicate repeated notifications with alert fingerprint and `for` durations.
- Route finance alerts to the finance lead as well as operations.
- Route security and biometric signals to the privacy/legal contact.
- Never suppress P1 hard-invariant alerts; trial balance, duplicate payment, audit-chain break, and breach signals always page.
- Follow `docs/runbooks/alert-triage.md` for first checks and `docs/runbooks/on-call.md` for escalation.

## References

- `docs/observability.md` for SLOs, metrics, retention, and the alert catalogue.
- `docs/runbooks/monitoring.md` for implementation and verification steps.
- `docs/runbooks/on-call.md` for rotation and SLAs.
- `docs/runbooks/incident-response.md` for incident command and breach handling.
