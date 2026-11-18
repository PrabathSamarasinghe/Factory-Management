INSERT INTO "identity"."roles" ("id", "code", "name", "description", "is_system", "requires_2fa")
VALUES (gen_random_uuid(), 'ADMIN', 'Administrator', 'Full system administrator', true, true)
ON CONFLICT ("code") DO NOTHING;

INSERT INTO "identity"."permissions" (
    "id", "code", "resource", "action", "description"
)
VALUES
    (gen_random_uuid(), 'lorry:read', 'lorry', 'read', 'View lorries and fleet alerts'),
    (gen_random_uuid(), 'lorry:create', 'lorry', 'create', 'Register lorries'),
    (gen_random_uuid(), 'lorry:update', 'lorry', 'update', 'Update lorries, documents and maintenance'),
    (gen_random_uuid(), 'route:read', 'route', 'read', 'View routes and stops'),
    (gen_random_uuid(), 'route:create', 'route', 'create', 'Create routes'),
    (gen_random_uuid(), 'route:update', 'route', 'update', 'Update routes and stops'),
    (gen_random_uuid(), 'assignment:read', 'assignment', 'read', 'View route assignments'),
    (gen_random_uuid(), 'assignment:create', 'assignment', 'create', 'Create route assignments'),
    (gen_random_uuid(), 'assignment:change', 'assignment', 'change', 'Change route assignments'),
    (gen_random_uuid(), 'trip:read', 'trip', 'read', 'View all trips'),
    (gen_random_uuid(), 'trip:read-own', 'trip', 'read-own', 'View own trips'),
    (gen_random_uuid(), 'trip:create', 'trip', 'create', 'Start trips'),
    (gen_random_uuid(), 'trip:update', 'trip', 'update', 'Record trip events and factory arrival'),
    (gen_random_uuid(), 'trip:end', 'trip', 'end', 'End trips after finalised collections'),
    (gen_random_uuid(), 'trip:cancel', 'trip', 'cancel', 'Cancel trips')
ON CONFLICT ("code") DO UPDATE
SET "resource" = EXCLUDED."resource",
    "action" = EXCLUDED."action",
    "description" = EXCLUDED."description";

INSERT INTO "identity"."role_permissions" ("role_id", "permission_id", "scope")
SELECT roles."id", permissions."id", 'ALL'
FROM "identity"."roles" AS roles
CROSS JOIN "identity"."permissions" AS permissions
WHERE roles."code" = 'ADMIN'
  AND permissions."resource" IN ('lorry', 'route', 'assignment', 'trip')
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
