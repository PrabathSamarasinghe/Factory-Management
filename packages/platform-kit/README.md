# @galatura/platform-kit

Shared security and platform primitives for Galatura factory services. Nothing
business-specific lives here: services import the same primitives so auth,
errors, logging, auditing, encryption and event delivery behave consistently.

- Node.js >= 22 (tested on Node 24)
- TypeScript, CommonJS output, NestJS 11 peer dependency
- Tests use Vitest and validate against the shared contracts in `../contracts`
  and `../event-contracts`

## Install

```bash
pnpm add @galatura/platform-kit
```

The package is published to GitHub Packages. Configure the registry (see
`.npmrc.example`):

```ini
@galatura:registry=https://npm.pkg.github.com
//npm.pkg.github.com/:_authToken=${NODE_AUTH_TOKEN}
```

## Modules

### Errors and exception filter

Every error response uses the shared envelope
(`packages/contracts/api/error-envelope.v1.json`).
`AppExceptionFilter` converts `AppError`, Nest `HttpException` and unknown
errors into that envelope and echoes `X-Request-Id`.

```ts
import {
  AppExceptionFilter,
  ForbiddenError,
  NotFoundError,
  createLogger,
} from '@galatura/platform-kit';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';

const logger = createLogger({ service: 'collection-service', env: 'dev' });

@Module({
  providers: [{ provide: APP_FILTER, useFactory: () => new AppExceptionFilter(logger) }],
})
export class AppModule {}

throw new ForbiddenError('Outside your route.');
```

### Logging

`createLogger` writes one JSON object per line and redacts sensitive keys and
values (passwords, tokens, `Authorization`, NIC, bank accounts, phone, email,
`Idempotency-Key`). Use `child()` to bind request/entity context.

```ts
const log = createLogger({ service: 'fleet-service', env: 'prod', version: '1.4.0' });
const requestLog = log.child({ requestId, userId });
requestLog.info('trip.started', { tripId });
```

### Crypto

`EnvKeyProvider` implements envelope encryption: a random AES-256-GCM data key
per value, wrapped by the active key-encryption key. `AwsKmsKeyProvider` keeps
the same `KeyProvider` contract as a fail-closed stub for the later AWS move.

| Variable                 | Purpose                                       |
| ------------------------ | --------------------------------------------- |
| `PLATFORM_MASTER_KEY`    | 32-byte KEK, base64 or hex                    |
| `PLATFORM_MASTER_KEY_ID` | Key id stored in ciphertext (default `env-1`) |

```ts
import {
  EnvKeyProvider,
  blindIndex,
  decryptString,
  encryptString,
  hashPassword,
  verifyPassword,
} from '@galatura/platform-kit';

const keys = EnvKeyProvider.fromEnv();
const ciphertext = await encryptString(nic, keys);
const nicAgain = await decryptString(ciphertext, keys);

const nicLookup = blindIndex(nic, process.env.PLATFORM_BLIND_INDEX_KEY!);
const passwordHash = await hashPassword(plainPassword);
const ok = await verifyPassword(passwordHash, plainPassword);
```

- Argon2id defaults: 19 MiB memory, 2 iterations, parallelism 1, 32-byte output.
- Use a **separate** blind-index secret, never the encryption key.
- Previous KEKs can be supplied via `previousKeys` to decrypt during rotation.
- Ciphertext format: `v1.<keyId>.<wrapIv>.<wrapTag>.<wrappedDek>.<dataIv>.<dataTag>.<ciphertext>`.
- Use `@galatura/platform-kit/keys` for `EnvKeyProvider` and
  `AwsKmsKeyProvider` without importing the rest of the package.

### Storage

`FileStorage` is the file boundary for documents and photos.
`FirebaseFileStorage` adapts a Firebase `Bucket`-like object without depending
on `firebase-admin`; `S3FileStorage` is a fail-closed placeholder for the AWS
migration.

```ts
import { FirebaseFileStorage } from '@galatura/platform-kit/storage';

const storage = new FirebaseFileStorage(bucket);
await storage.putObject({
  key: 'documents/nic/front.jpg',
  body: buffer,
  contentType: 'image/jpeg',
  cacheControl: 'private, max-age=0',
  metadata: { owner: personId },
});

const url = await storage.getDownloadUrl('documents/nic/front.jpg', {
  expiresInSeconds: 300,
});
```

Object keys are relative, cannot contain empty/`.`/`..` segments, and signed
URLs are limited to 1–900 seconds. Keep buckets private; serve uploads through
short-lived signed URLs.

### Prisma extensions

`@galatura/platform-kit/prisma` provides composable query extensions for
soft delete, audit and field encryption. Services apply them in their own Prisma
client setup, so `@prisma/client` stays out of this package.

```ts
import {
  createPrismaAuditExtension,
  createPrismaEncryptionExtension,
  createSoftDeleteExtension,
} from '@galatura/platform-kit/prisma';

const base = new PrismaClient();

export const prisma = base
  .$extends(
    createSoftDeleteExtension(base, {
      models: { Person: true, Vehicle: true },
      deletedBy: () => currentActor()?.id,
    }),
  )
  .$extends(
    createPrismaAuditExtension({
      audit,
      models: { Person: true, Collection: true },
      actor: () => currentActor(),
    }),
  )
  .$extends(
    createPrismaEncryptionExtension({
      keys,
      models: {
        Person: [
          {
            plain: 'nic',
            stored: 'nicEncrypted',
            blindIndex: { field: 'nicBlindIndex', key: blindIndexKey },
          },
        ],
      },
    }),
  );
```

- Soft delete replaces `delete`/`deleteMany` with an update to `deletedAt` and
  filters reads by `deletedAt: null`. Pass `{ includeDeleted: true }` to bypass
  the filter. Hard deletes remain available through raw SQL, so deny `DELETE` on
  history-bearing tables at the database role.
- Audit entries are written after successful mutations. Supply `before` when the
  trail needs the previous state; for stock/money changes use a transactional
  audit sink so the mutation and audit commit together.
- Encryption writes ciphertext into `stored` and decrypts results recursively.
  Nested relation writes are not rewritten; split them into separate writes.
  Blind-index columns are for equality lookup only, never for display.

### Auth

`JwtVerifier` verifies RS256/EdDSA access tokens against a local JWKS document
or a remote JWKS endpoint (fetched with the Node `fetch` and cached). It maps
claims to a `Principal` (`sub`, `roles`, `permissions`, `permVersion`, `scope`,
`aud`, ...). Service-to-service tokens can be signed and verified with the
helpers below.

```ts
import {
  JwtAuthGuard,
  JwtVerifier,
  signServiceToken,
  verifyServiceToken,
} from '@galatura/platform-kit';
import { APP_GUARD } from '@nestjs/core';

const verifier = new JwtVerifier({
  jwksUri: 'https://identity.internal/.well-known/jwks.json',
  issuer: 'galatura-identity',
  audience: 'galatura-api',
});

@Module({
  providers: [
    { provide: JwtVerifier, useValue: verifier },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule {}

const token = signServiceToken(
  { service: 'collection-service', scopes: ['collection:write'] },
  { privateKey: servicePrivateKey, audience: 'fleet-service', keyId: 'svc-1' },
);
const service = verifyServiceToken(token, { publicKey: fleetPublicKey, audience: 'fleet-service' });
```

### RBAC

Permissions are resolved server-side and cached per user and permission version.
Token-embedded permissions are used when present. Guards are deny-by-default:
a route without `@RequirePermission` is forbidden unless marked `@Public`.

```ts
import {
  InMemoryPermissionCache,
  PermissionsGuard,
  RbacService,
  RequirePermission,
  Public,
  assertScope,
} from '@galatura/platform-kit';
import { APP_GUARD } from '@nestjs/core';

const rbac = new RbacService(new InMemoryPermissionCache(), {
  resolve: (userId) => identityClient.permissionsFor(userId),
});

@Module({
  providers: [
    { provide: RbacService, useValue: rbac },
    { provide: APP_GUARD, useClass: PermissionsGuard },
  ],
})
export class AppModule {}

@Controller('collections')
export class CollectionsController {
  @Post()
  @RequirePermission('collection:write')
  create(@CurrentPrincipal() principal: Principal) {
    assertScope(principal, 'ROUTE');
  }

  @Get('health')
  @Public()
  health() {}
}
```

`DataScope` is ordered `OWN < ROUTE < DEPARTMENT < ALL`; `hasScope`/`assertScope`
enforce it. Publish permission-change events so caches can be invalidated, or
bump `permVersion` on the user.

### Audit

`AuditService` appends redacted entries to a hash chain. Calls are serialised so
concurrent writes cannot fork the chain. `verifyAuditChain` returns the first
broken entry.

```ts
import { AuditService, InMemoryAuditSink, verifyAuditChain } from '@galatura/platform-kit';

const audit = new AuditService(new InMemoryAuditSink());

await audit.record({
  actorId: principal.subject,
  actorType: 'USER',
  action: 'collection.finalize',
  entityType: 'collection',
  entityId: collectionId,
  before,
  after,
  requestId,
  ip,
  userAgent,
});

const result = verifyAuditChain(await sink.list());
```

Persist entries in `audit_log` with `previous_hash`/`hash` unique constraints.
The plain chain detects partial rewrites; HMAC with a managed audit secret is a
later hardening step.

### Outbox, inbox and events

Events follow `packages/event-contracts` (`domain.entity.pastTenseAction`,
UUIDv7 id, actor, payload). Writes go to an outbox transactionally, then a
publisher drains it to an `EventBus` (BullMQ in phase 1). Consumers use
`InboxProcessor` for at-least-once de-duplication.

```ts
import {
  InboxProcessor,
  InMemoryEventBus,
  InboxStore,
  OutboxPublisher,
  OutboxStore,
  createEvent,
} from '@galatura/platform-kit';

const event = createEvent({
  type: 'collection.finalized',
  payload: { tripId, supplierId, totalNetKg: '1250.500', totalBags: 25 /* ... */ },
  actor: { type: 'USER', id: principal.subject },
  producer: 'collection-service',
  correlationId,
});

await outbox.append(event);
await new OutboxPublisher(outbox, bus).publishPending();

const inbox = new InboxProcessor(inboxStore, 'accounts-service', async (envelope) => {
  await postJournal(envelope);
});
await inbox.process(envelope);
```

`OutboxPublisher` retries with attempt tracking and skips records at
`maxAttempts` (dead-letter them from your store). `InboxProcessor` de-duplicates
concurrent deliveries of the same event.

### Idempotency

Apply `IdempotencyInterceptor` to mutating endpoints. It requires an
`Idempotency-Key` header by default, hashes the method/path/body canonically,
replays the stored response for the same request, and rejects reuse with a
different body as `IDEMPOTENCY_KEY_REUSED`.

```ts
import { IdempotencyInterceptor, InMemoryIdempotencyStore } from '@galatura/platform-kit';
import { APP_INTERCEPTOR } from '@nestjs/core';

@Module({
  providers: [
    {
      provide: APP_INTERCEPTOR,
      useValue: new IdempotencyInterceptor(new InMemoryIdempotencyStore(), { ttlMs: 86_400_000 }),
    },
  ],
})
export class AppModule {}
```

Use a database-backed store in production with a unique constraint on `key`.

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Tests validate the error envelope, list envelope, error-code catalogue and event
envelopes against the JSON Schemas in `packages/contracts` and
`packages/event-contracts`.

## Release

1. `pnpm build && pnpm test`
2. Set `NODE_AUTH_TOKEN` to a GitHub token with `write:packages` for the
   `galatura` scope.
3. Copy `.npmrc.example` to `.npmrc` (never commit it).
4. `pnpm publish`

Consumers must be able to read the package from GitHub Packages.
