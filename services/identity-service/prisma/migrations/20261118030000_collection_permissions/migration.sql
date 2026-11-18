INSERT INTO "identity"."permissions" (
    "id", "code", "resource", "action", "description"
)
VALUES
    (gen_random_uuid(), 'collection:read', 'collection', 'read', 'View collection pickups, totals and readiness'),
    (gen_random_uuid(), 'collection:record', 'collection', 'record', 'Record field pickups and sync them'),
    (gen_random_uuid(), 'collection:correct', 'collection', 'correct', 'Correct previously recorded pickups'),
    (gen_random_uuid(), 'collection:weigh', 'collection', 'weigh', 'Record factory weighings'),
    (gen_random_uuid(), 'collection:finalize', 'collection', 'finalize', 'Finalise supplier daily totals'),
    (gen_random_uuid(), 'collection:review', 'collection', 'review', 'Review discrepancies and collection readiness'),
    (gen_random_uuid(), 'collection:resolve', 'collection', 'resolve', 'Resolve weighing discrepancies')
ON CONFLICT ("code") DO UPDATE
SET "resource" = EXCLUDED."resource",
    "action" = EXCLUDED."action",
    "description" = EXCLUDED."description";

INSERT INTO "identity"."role_permissions" ("role_id", "permission_id", "scope")
SELECT roles."id", permissions."id", 'ALL'
FROM "identity"."roles" AS roles
CROSS JOIN "identity"."permissions" AS permissions
WHERE roles."code" = 'ADMIN'
  AND permissions."resource" = 'collection'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
