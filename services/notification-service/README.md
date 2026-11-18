# Notification Service

NestJS service for supplier SMS notifications and delivery status. Exposed by the gateway at `/api/v1/notification` (default service port `3006`).

## Responsibilities

- Consume `collection.finalized` v1 events bridged by `collection-service` after finalisation.
- Render per-language templates and send SMS through a configurable provider adapter.
- Deduplicate by `collection-finalized:<supplierId>:<collectionDate>`.
- Enforce daily, monthly and cost caps before each provider call.
- Retry with exponential backoff and move exhausted messages to a dead-letter table.
- Accept signed delivery receipts and mirror status to `collection-service` daily totals.
- Expose status, resend and template endpoints to C4. C3 reads mirrored status from collection sync snapshots only.

## Configuration

| Variable                    | Default                 | Purpose                                                               |
| --------------------------- | ----------------------- | --------------------------------------------------------------------- |
| `DATABASE_URL`              | required                | PostgreSQL connection string.                                         |
| `DATABASE_POOL_MAX`         | `5`                     | Prisma pool size.                                                     |
| `PLATFORM_MASTER_KEY`       | required                | 32-byte base64/hex key for recipient phone encryption.                |
| `PLATFORM_MASTER_KEY_ID`    | `env-1`                 | Active key id.                                                        |
| `SMS_PROVIDER`              | `FAKE`                  | `FAKE` logs a generated provider id; `HTTP` calls `SMS_PROVIDER_URL`. |
| `SMS_PROVIDER_URL`          | unset                   | Full outbound provider URL; no URL is hard-coded.                     |
| `SMS_PROVIDER_API_KEY`      | unset                   | Bearer token for the HTTP adapter.                                    |
| `SMS_PROVIDER_TIMEOUT_MS`   | `10000`                 | Provider call timeout.                                                |
| `SMS_SENDER_ID`             | `GALATURA`              | Sender ID when no provider config row applies.                        |
| `SMS_LANGUAGE`              | `en`                    | Template language (`en`, `si`, `ta` seeded).                          |
| `SMS_WEBHOOK_SECRET`        | required for webhooks   | HMAC secret for `x-sms-signature: sha256=<hex>`.                      |
| `SMS_ALLOWED_PROVIDERS`     | `FAKE,HTTP`             | Comma-separated inbound provider allow-list.                          |
| `SMS_MAX_ATTEMPTS`          | `5`                     | Attempts before dead-lettering.                                       |
| `SMS_RETRY_BASE_MS`         | `60000`                 | Exponential backoff base.                                             |
| `SMS_WORKER_INTERVAL_MS`    | `5000`                  | Queue poll interval.                                                  |
| `SMS_DAILY_LIMIT`           | `500`                   | Fallback daily cap when no provider config row exists.                |
| `SMS_MONTHLY_LIMIT`         | `10000`                 | Fallback monthly cap.                                                 |
| `SMS_COST_PER_MESSAGE`      | `0.05`                  | Fallback cost per message.                                            |
| `SMS_COST_LIMIT`            | `500`                   | Monthly cost ceiling.                                                 |
| `PEOPLE_SERVICE_URL`        | `http://localhost:3003` | Supplier master-data lookup.                                          |
| `COLLECTION_SERVICE_URL`    | `http://localhost:3005` | SMS status callback target.                                           |
| `NOTIFICATION_INGEST_TOKEN` | unset                   | Optional shared token for internal event/webhook calls.               |
| `SERVICE_TIMEOUT_MS`        | `5000`                  | Internal service call timeout.                                        |

## Local verification

```powershell
pnpm --filter @galatura/notification-service prisma:generate
pnpm --filter @galatura/notification-service test
pnpm --filter @galatura/notification-service typecheck
```

The `FAKE` provider makes no external calls. It returns a generated provider message id so the full queue, status and resend flow can be exercised locally.

## Webhook body

```json
{
  "provider": "HTTP",
  "providerMessageId": "provider-123",
  "status": "DELIVERED",
  "reason": null
}
```

The raw JSON body is signed with `SMS_WEBHOOK_SECRET` using HMAC-SHA256 and sent in `x-sms-signature` as `sha256=<hex>`. Delivery receipts without a valid signature are rejected.

## Data handling

Recipient phone numbers are encrypted with the platform envelope encryption helpers before storage. API responses expose only a masked recipient. Rendered SMS bodies, phone numbers and provider credentials are never written to audit logs, metrics labels or emitted events.
