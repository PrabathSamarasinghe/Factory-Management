# Attendance Service

NestJS service for biometric face enrolment, attendance marking, shifts, daily calculation, corrections, leave, devices, audit, and `attendance.day.closed` outbox events.

## Runtime

- Port: `3003` (`PORT` override)
- Gateway prefix: `/api/v1/attendance`
- PostgreSQL schema: `attendance`
- Prisma client output: `generated/prisma`

## Commands

```powershell
pnpm --filter @galatura/attendance-service prisma:generate
pnpm --filter @galatura/attendance-service typecheck
pnpm --filter @galatura/attendance-service test
pnpm --filter @galatura/attendance-service build
```

Apply the migration with the repository Prisma workflow. The initial migration is `prisma/migrations/20261118000000_attendance_init/migration.sql`.

## Environment

| Variable | Default | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | required | PostgreSQL transaction-pooler connection string |
| `DATABASE_POOL_MAX` | `5` | PostgreSQL adapter pool size per service instance |
| `PORT` | `3003` | HTTP port |
| `PLATFORM_MASTER_KEY` | development fallback | AES-GCM key material for face templates |
| `PEOPLE_SERVICE_URL` | `http://localhost:3002` | Direct people-service URL for consent checks |
| `INTERNAL_SERVICE_TOKEN` | unset | Shared secret accepted on `x-internal-token` for internal event endpoints |
| `ATTENDANCE_FACE_ENGINE` | `stub` | `stub` for tests/development, `http` for an external engine |
| `FACE_ENGINE_URL` | unset | Required when `ATTENDANCE_FACE_ENGINE=http` |
| `FACE_ENGINE_API_KEY` | unset | Optional `x-api-key` header value for the HTTP face engine |
| `ATTENDANCE_FACE_THRESHOLD` | `0.82` | Minimum cosine similarity for a match |
| `ATTENDANCE_LIVENESS_THRESHOLD` | `0.8` | Minimum liveness score |
| `ATTENDANCE_TIMEZONE_OFFSET_MINUTES` | `330` | Factory-local timezone offset |
| `ATTENDANCE_DAILY_CLOSE_ENABLED` | `false` | Enables the 00:05 local daily close scheduler |
| `ATTENDANCE_PERSON_ATTEMPT_LIMIT` | `5` | Person verification attempts per window |
| `ATTENDANCE_DEVICE_ATTEMPT_LIMIT` | `20` | Device verification attempts per window |

The stub engine is deterministic and only for development and tests. It is not a production face model and does not provide real liveness detection.

## Endpoints

Gateway-injected headers provide the caller identity and permissions. The service trusts `x-user-id`, `x-permissions`, and related headers only when deployed behind the gateway.

| Method | Path | Permission |
| --- | --- | --- |
| `POST` | `/enrollments` | `face:enroll` |
| `POST` | `/enrollments/:personId/revoke` | `face:revoke` |
| `GET` | `/enrollments/:personId/status` | `face:read` |
| `POST` | `/mark` | `attendance:mark` |
| `POST` | `/mark/manual` | `attendance:manual` |
| `GET` | `/events` | `attendance:read` |
| `GET` | `/days` | `attendance:read` |
| `GET` | `/days/summary` | `attendance:read` |
| `POST` | `/days/close` | `attendance:close` |
| `GET` | `/reports/monthly` | `attendance:report` |
| `GET` | `/shifts` | `shift:read` |
| `POST` | `/shifts` | `shift:manage` |
| `PATCH` | `/shifts/:id` | `shift:manage` |
| `GET` | `/shift-assignments` | `shift:read` |
| `POST` | `/shift-assignments` | `shift:manage` |
| `PATCH` | `/shift-assignments/:id` | `shift:manage` |
| `GET` | `/corrections` | `attendance:read` |
| `POST` | `/corrections` | `attendance:correct` |
| `POST` | `/corrections/:id/approve` | `attendance:approve` |
| `POST` | `/corrections/:id/reject` | `attendance:approve` |
| `GET` | `/leave-types` | `leave:read` |
| `POST` | `/leave-types` | `leave:manage` |
| `GET` | `/leave-requests` | `leave:read` |
| `POST` | `/leave-requests` | `leave:request` |
| `POST` | `/leave-requests/:id/decide` | `leave:approve` |
| `GET` | `/holidays` | `leave:read` |
| `POST` | `/holidays` | `leave:manage` |
| `GET` | `/devices` | `device:read` |
| `POST` | `/devices` | `device:manage` |
| `PATCH` | `/devices/:id/status` | `device:manage` |
| `POST` | `/internal/consent-withdrawals` | `INTERNAL_SERVICE_TOKEN` via `x-internal-token` |

## Marking Flow

1. Validate the client event ID and optional IDs.
2. Return the existing event and day when `clientEventId` was already processed.
3. Apply device and person rate limits.
4. Run liveness and face analysis.
5. Match against active encrypted templates, either 1:1 or 1:N.
6. Record a `FaceVerificationAttempt` for success or failure.
7. Create the `AttendanceEvent`, recalculate the day, and write audit entries.

Enrolment requires an active biometric consent in people-service. The app records consent before calling enrolment.

## Daily Close

`POST /days/close` recalculates all people with events, shift assignments, approved leave, or corrections for the date. Closing is idempotent through `AttendanceDay.closedAt`. Each newly closed day appends an `attendance.day.closed` v1 event to the transactional outbox.

When `ATTENDANCE_DAILY_CLOSE_ENABLED=true`, the scheduler closes the previous local day at 00:05. The scheduler is disabled by default.

## Security Notes

- Raw face images are not persisted by this service.
- Face templates are encrypted before storage; decrypted values exist only in process memory during matching.
- Do not expose this service directly to untrusted clients. Permission headers must come from the gateway.
- The initial face threshold is provisional until a local model evaluation is completed. See `docs/face-model-evaluation.md`.
