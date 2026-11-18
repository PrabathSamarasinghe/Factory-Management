INSERT INTO "identity"."permissions" (
    "id", "code", "resource", "action", "description"
)
VALUES
    (gen_random_uuid(), 'sms:read', 'sms', 'read', 'View SMS delivery status and dead-letter summaries'),
    (gen_random_uuid(), 'sms:resend', 'sms', 'resend', 'Resend a failed SMS or replay a dead-letter entry'),
    (gen_random_uuid(), 'sms:template', 'sms', 'template', 'View and update SMS templates'),
    (gen_random_uuid(), 'sms:review', 'sms', 'review', 'Review SMS dead-letter queue'),
    (gen_random_uuid(), 'sms:ingest', 'sms', 'ingest', 'Ingest SMS trigger events from internal services')
ON CONFLICT ("code") DO UPDATE
SET "resource" = EXCLUDED."resource",
    "action" = EXCLUDED."action",
    "description" = EXCLUDED."description";

INSERT INTO "identity"."role_permissions" ("role_id", "permission_id", "scope")
SELECT roles."id", permissions."id", 'ALL'
FROM "identity"."roles" AS roles
CROSS JOIN "identity"."permissions" AS permissions
WHERE roles."code" = 'ADMIN'
  AND permissions."resource" = 'sms'
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
