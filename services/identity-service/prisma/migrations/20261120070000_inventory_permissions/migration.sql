INSERT INTO "identity"."permissions" (
    "id", "code", "resource", "action", "description"
)
VALUES
    (gen_random_uuid(), 'category:read', 'category', 'read', 'View inventory categories'),
    (gen_random_uuid(), 'category:write', 'category', 'write', 'Create and update inventory categories'),
    (gen_random_uuid(), 'unit:read', 'unit', 'read', 'View units of measure'),
    (gen_random_uuid(), 'unit:write', 'unit', 'write', 'Create and update units of measure'),
    (gen_random_uuid(), 'item:read', 'item', 'read', 'View inventory items'),
    (gen_random_uuid(), 'item:create', 'item', 'create', 'Create inventory items'),
    (gen_random_uuid(), 'item:update', 'item', 'update', 'Update inventory items'),
    (gen_random_uuid(), 'item:deactivate', 'item', 'deactivate', 'Deactivate inventory items'),
    (gen_random_uuid(), 'warehouse:read', 'warehouse', 'read', 'View warehouses'),
    (gen_random_uuid(), 'warehouse:write', 'warehouse', 'write', 'Create and update warehouses'),
    (gen_random_uuid(), 'vendor:read', 'vendor', 'read', 'View inventory vendors'),
    (gen_random_uuid(), 'vendor:write', 'vendor', 'write', 'Create and update inventory vendors'),
    (gen_random_uuid(), 'receipt:read', 'receipt', 'read', 'View goods receipts'),
    (gen_random_uuid(), 'receipt:create', 'receipt', 'create', 'Draft goods receipts'),
    (gen_random_uuid(), 'receipt:approve', 'receipt', 'approve', 'Approve goods receipts'),
    (gen_random_uuid(), 'issue:read', 'issue', 'read', 'View goods issues'),
    (gen_random_uuid(), 'issue:create', 'issue', 'create', 'Draft goods issues'),
    (gen_random_uuid(), 'issue:approve', 'issue', 'approve', 'Approve goods issues'),
    (gen_random_uuid(), 'transfer:read', 'transfer', 'read', 'View stock transfers'),
    (gen_random_uuid(), 'transfer:create', 'transfer', 'create', 'Draft stock transfers'),
    (gen_random_uuid(), 'transfer:approve', 'transfer', 'approve', 'Approve stock transfers'),
    (gen_random_uuid(), 'adjustment:read', 'adjustment', 'read', 'View inventory adjustments'),
    (gen_random_uuid(), 'adjustment:create', 'adjustment', 'create', 'Draft inventory adjustments'),
    (gen_random_uuid(), 'adjustment:approve', 'adjustment', 'approve', 'Approve inventory adjustments'),
    (gen_random_uuid(), 'stocktake:read', 'stocktake', 'read', 'View stock takes'),
    (gen_random_uuid(), 'stocktake:create', 'stocktake', 'create', 'Draft stock takes'),
    (gen_random_uuid(), 'stocktake:complete', 'stocktake', 'complete', 'Complete stock takes'),
    (gen_random_uuid(), 'stock:read', 'stock', 'read', 'View stock balances and movements'),
    (gen_random_uuid(), 'stock:movement', 'stock', 'movement', 'Record stock movements'),
    (gen_random_uuid(), 'stock:adjust', 'stock', 'adjust', 'Adjust stock balances'),
    (gen_random_uuid(), 'inventory:report', 'inventory', 'report', 'View inventory reports'),
    (gen_random_uuid(), 'inventory:export', 'inventory', 'export', 'Export inventory reports')
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
    'category:read', 'category:write', 'unit:read', 'unit:write',
    'item:read', 'item:create', 'item:update', 'item:deactivate',
    'warehouse:read', 'warehouse:write', 'vendor:read', 'vendor:write',
    'receipt:read', 'receipt:create', 'receipt:approve',
    'issue:read', 'issue:create', 'issue:approve',
    'transfer:read', 'transfer:create', 'transfer:approve',
    'adjustment:read', 'adjustment:create', 'adjustment:approve',
    'stocktake:read', 'stocktake:create', 'stocktake:complete',
    'stock:read', 'stock:movement', 'stock:adjust',
    'inventory:report', 'inventory:export'
  )
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "identity"."roles" (
    "id", "code", "name", "description", "is_system", "requires_2fa"
)
VALUES (
    gen_random_uuid(),
    'STORE_KEEPER',
    'Store Keeper',
    'C6 inventory maker role with least-privilege master data and draft transaction access',
    true,
    false
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
WHERE roles."code" = 'STORE_KEEPER'
  AND permissions."code" IN (
    'category:read', 'unit:read',
    'item:read', 'item:create', 'item:update', 'item:deactivate',
    'warehouse:read', 'vendor:read',
    'receipt:read', 'receipt:create',
    'issue:read', 'issue:create',
    'transfer:read', 'transfer:create',
    'adjustment:read',
    'stocktake:read', 'stocktake:create', 'stocktake:complete',
    'stock:read', 'stock:movement',
    'inventory:report'
  )
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "identity"."roles" (
    "id", "code", "name", "description", "is_system", "requires_2fa"
)
VALUES (
    gen_random_uuid(),
    'STORE_MANAGER',
    'Store Manager',
    'C6 inventory checker role with full inventory permissions and 2FA for approvals',
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
WHERE roles."code" = 'STORE_MANAGER'
  AND permissions."code" IN (
    'category:read', 'category:write', 'unit:read', 'unit:write',
    'item:read', 'item:create', 'item:update', 'item:deactivate',
    'warehouse:read', 'warehouse:write', 'vendor:read', 'vendor:write',
    'receipt:read', 'receipt:create', 'receipt:approve',
    'issue:read', 'issue:create', 'issue:approve',
    'transfer:read', 'transfer:create', 'transfer:approve',
    'adjustment:read', 'adjustment:create', 'adjustment:approve',
    'stocktake:read', 'stocktake:create', 'stocktake:complete',
    'stock:read', 'stock:movement', 'stock:adjust',
    'inventory:report', 'inventory:export'
  )
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
