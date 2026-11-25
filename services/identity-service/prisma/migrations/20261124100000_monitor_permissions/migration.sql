INSERT INTO "identity"."permissions" (
    "id", "code", "resource", "action", "description"
)
VALUES
    (gen_random_uuid(), 'monitor:read', 'monitor', 'read', 'View monitor dashboards and live read models'),
    (gen_random_uuid(), 'monitor:finance', 'monitor', 'finance', 'View high-level finance snapshots for monitoring'),
    (gen_random_uuid(), 'webhook:manage', 'webhook', 'manage', 'Manage outbound webhook subscriptions')
ON CONFLICT ("code") DO UPDATE
SET "resource" = EXCLUDED."resource",
    "action" = EXCLUDED."action",
    "description" = EXCLUDED."description";

INSERT INTO "identity"."role_permissions" ("role_id", "permission_id", "scope")
SELECT roles."id", permissions."id", 'ALL'
FROM "identity"."roles" AS roles
CROSS JOIN "identity"."permissions" AS permissions
WHERE roles."code" = 'ADMIN'
  AND permissions."code" IN (
    'monitor:read', 'monitor:finance', 'webhook:manage'
  )
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "identity"."roles" (
    "id", "code", "name", "description", "is_system", "requires_2fa"
)
VALUES (
    gen_random_uuid(),
    'MONITOR',
    'Monitor',
    'C7 read-only monitoring role with no write permissions',
    true,
    true
)
ON CONFLICT ("code") DO UPDATE
SET "name" = EXCLUDED."name",
    "description" = EXCLUDED."description",
    "is_system" = EXCLUDED."is_system",
    "requires_2fa" = EXCLUDED."requires_2fa";

INSERT INTO "identity"."role_permissions" ("role_id", "permission_id", "scope")
SELECT roles."id", permissions."id", 'ALL'
FROM "identity"."roles" AS roles
CROSS JOIN "identity"."permissions" AS permissions
WHERE roles."code" = 'MONITOR'
  AND permissions."code" IN (
    'monitor:read', 'monitor:finance'
  )
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
