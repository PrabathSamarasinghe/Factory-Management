INSERT INTO "identity"."permissions" (
    "id", "code", "resource", "action", "description"
)
VALUES (
    gen_random_uuid(),
    'trip:override-end',
    'trip',
    'override-end',
    'End a trip without finalised collection totals, with a mandatory recorded reason'
)
ON CONFLICT ("code") DO UPDATE
SET "resource" = EXCLUDED."resource",
    "action" = EXCLUDED."action",
    "description" = EXCLUDED."description";

INSERT INTO "identity"."role_permissions" ("role_id", "permission_id", "scope")
SELECT roles."id", permissions."id", 'ALL'
FROM "identity"."roles" AS roles
CROSS JOIN "identity"."permissions" AS permissions
WHERE roles."code" = 'ADMIN'
  AND permissions."code" = 'trip:override-end'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
