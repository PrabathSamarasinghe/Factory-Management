# Realtime service

WebSocket fan-out, catch-up buffering, signed webhooks, and C7 push plumbing for Phase 9.

The service consumes domain events through `/events/ingest`, maps them to permission-scoped channels, buffers them for 24-hour catch-up, publishes them to authorized sockets at `/connect`, delivers outbound webhooks with HMAC signatures and retries, accepts signed provider webhooks, and registers FCM tokens for generic monitor refreshes.

## Configuration

- `DATABASE_URL` — required PostgreSQL connection string for the `realtime` schema.
- `DATABASE_POOL_MAX` — optional pool size, default `5`.
- `PORT` — optional HTTP port, default `3007`.
- `REALTIME_INGEST_TOKEN` — optional shared token required on `/events/ingest` via `x-service-token`.
- `PLATFORM_MASTER_KEY` — required 32-byte base64/hex key used to encrypt webhook secrets.
- `SMS_WEBHOOK_SECRET`, `WEBHOOK_INBOUND_SECRET` — provider/global secrets for inbound webhook HMAC verification.
- `WEBHOOK_TIMEOUT_MS` — optional outbound webhook timeout, default `5000`.
- `FCM_PROJECT_ID`, `FCM_SERVICE_ACCOUNT_JSON` — Firebase HTTP v1 credentials. Push is skipped when either is absent.

## HTTP and WebSocket

- `POST /tickets` — issue a one-time ticket with a 30-second expiry.
- `WS /connect?ticket=` — WebSocket upgrade path; `/ws/connect` and `/realtime/connect` are also accepted behind a proxy.
- `GET /catch-up?channel=&afterId=` — return buffered events after a cursor.
- `GET|POST|PATCH|DELETE /webhook-subscriptions` — manage outbound webhooks with `webhook:manage`.
- `POST /webhook-subscriptions/:id/test` — send a signed test delivery.
- `POST /webhooks/inbound/:provider` — verify provider HMAC and deduplicate delivery receipts.
- `POST /push/tokens` — register or deactivate an FCM token.
- `POST /push/test` — send a generic monitor-refresh test notification.

All HTTP responses use `{ data: ... }`. WebSocket messages use JSON with a `type` discriminator.

## Validation

```bash
pnpm --filter @galatura/realtime-service prisma:generate
pnpm --filter @galatura/realtime-service typecheck
pnpm --filter @galatura/realtime-service test
pnpm --filter @galatura/realtime-service build
pnpm exec prettier --check "services/realtime-service/**/*.{ts,json,md}"
pnpm prisma:check:static
```

## Invariants

- Tickets are single-use, expire after 30 seconds, and carry a snapshot of the principal permissions.
- Channel subscriptions are checked against both the ticket channels and the permission snapshot.
- `monitor:read` is sufficient for `trips.live`, `weighing.live`, and `monitor.today`.
- `permissions.changed` events re-filter or disconnect affected sockets immediately.
- Buffered events expire after 24 hours and are deduplicated by `(consumer, event.id)`.
- Realtime and push payloads never carry phone numbers, message bodies, names, amounts, or account numbers.
- Webhook secrets are encrypted at rest and returned only as a masked hint.
- Outbound webhooks are signed with `sha256=<HMAC-SHA256 of timestamp.rawBody>`, retried three times with exponential backoff, and logged per attempt.
