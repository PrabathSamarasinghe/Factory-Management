INSERT INTO "identity"."permissions" (
    "id", "code", "resource", "action", "description"
)
VALUES
    (gen_random_uuid(), 'coa:read', 'coa', 'read', 'View the chart of accounts'),
    (gen_random_uuid(), 'coa:create', 'coa', 'create', 'Open a new chart of accounts entry'),
    (gen_random_uuid(), 'coa:update', 'coa', 'update', 'Rename or move a chart of accounts entry'),
    (gen_random_uuid(), 'coa:deactivate', 'coa', 'deactivate', 'Deactivate a chart of accounts entry'),
    (gen_random_uuid(), 'ledger:draft', 'ledger', 'draft', 'Draft a journal entry'),
    (gen_random_uuid(), 'ledger:post', 'ledger', 'post', 'Post a balanced journal entry'),
    (gen_random_uuid(), 'ledger:reverse', 'ledger', 'reverse', 'Reverse a posted journal entry'),
    (gen_random_uuid(), 'ledger:read', 'ledger', 'read', 'Read journal entries and ledgers'),
    (gen_random_uuid(), 'ledger:opening', 'ledger', 'opening', 'Post opening balances'),
    (gen_random_uuid(), 'ledger:ingest', 'ledger', 'ingest', 'Ingest ledger events from internal services'),
    (gen_random_uuid(), 'report:read', 'report', 'read', 'Read financial statements and reports'),
    (gen_random_uuid(), 'report:export', 'report', 'export', 'Export financial reports'),
    (gen_random_uuid(), 'report:configure', 'report', 'configure', 'Configure report sections and layout'),
    (gen_random_uuid(), 'payable:read', 'payable', 'read', 'Read supplier payable balances and aging'),
    (gen_random_uuid(), 'wages:read', 'wages', 'read', 'Read employee wages due balances'),
    (gen_random_uuid(), 'bill:generate', 'bill', 'generate', 'Generate supplier bills from collections'),
    (gen_random_uuid(), 'bill:approve', 'bill', 'approve', 'Approve supplier bills'),
    (gen_random_uuid(), 'payroll:run', 'payroll', 'run', 'Calculate a payroll run'),
    (gen_random_uuid(), 'payroll:approve', 'payroll', 'approve', 'Approve a payroll run'),
    (gen_random_uuid(), 'payment:read', 'payment', 'read', 'Read payments and payment batches'),
    (gen_random_uuid(), 'payment:create', 'payment', 'create', 'Create payments and payment batches'),
    (gen_random_uuid(), 'payment:approve', 'payment', 'approve', 'Approve payments and payment batches'),
    (gen_random_uuid(), 'payment:mark-paid', 'payment', 'mark-paid', 'Mark a payment as paid and post it'),
    (gen_random_uuid(), 'payment:export', 'payment', 'export', 'Export bank payment files'),
    (gen_random_uuid(), 'period:lock', 'period', 'lock', 'Lock an accounting period'),
    (gen_random_uuid(), 'period:close', 'period', 'close', 'Close an accounting period or fiscal year'),
    (gen_random_uuid(), 'recon:read', 'recon', 'read', 'Read bank reconciliations'),
    (gen_random_uuid(), 'recon:write', 'recon', 'write', 'Create and update bank reconciliations'),
    (gen_random_uuid(), 'rate:read', 'rate', 'read', 'Read tea rates'),
    (gen_random_uuid(), 'rate:write', 'rate', 'write', 'Create and update tea rates'),
    (gen_random_uuid(), 'rules:read', 'rules', 'read', 'Read posting rules'),
    (gen_random_uuid(), 'rules:write', 'rules', 'write', 'Create, update and approve posting rules'),
    (gen_random_uuid(), 'budget:read', 'budget', 'read', 'Read budgets and budget variances'),
    (gen_random_uuid(), 'budget:write', 'budget', 'write', 'Create and update budgets'),
    (gen_random_uuid(), 'bank:read', 'bank', 'read', 'Read masked company bank account details'),
    (gen_random_uuid(), 'bank:write', 'bank', 'write', 'Update company bank account details'),
    (gen_random_uuid(), 'adjustment:create', 'adjustment', 'create', 'Create supplier advances, loans and adjustments'),
    (gen_random_uuid(), 'adjustment:recover', 'adjustment', 'recover', 'Recover supplier advances and loans')
ON CONFLICT ("code") DO UPDATE
SET "resource" = EXCLUDED."resource",
    "action" = EXCLUDED."action",
    "description" = EXCLUDED."description";

INSERT INTO "identity"."role_permissions" ("role_id", "permission_id", "scope")
SELECT roles."id", permissions."id", 'ALL'
FROM "identity"."roles" AS roles
CROSS JOIN "identity"."permissions" AS permissions
WHERE roles."code" = 'ADMIN'
  AND permissions."resource" IN (
    'coa', 'ledger', 'report', 'payable', 'wages', 'bill', 'payroll', 'payment',
    'period', 'recon', 'rate', 'rules', 'budget', 'bank', 'adjustment'
  )
ON CONFLICT ("role_id", "permission_id") DO NOTHING;

INSERT INTO "identity"."roles" (
    "id", "code", "name", "description", "is_system", "requires_2fa"
)
VALUES (
    gen_random_uuid(),
    'ACCOUNTANT',
    'Accountant',
    'C5 accounts role with least-privilege access to ledgers, payables, payroll and payments',
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
WHERE roles."code" = 'ACCOUNTANT'
  AND permissions."code" IN (
    'coa:read', 'ledger:read', 'report:read', 'report:export', 'report:configure',
    'payable:read', 'wages:read', 'payment:read', 'recon:read', 'rate:read',
    'rules:read', 'budget:read', 'bank:read',
    'bill:generate', 'bill:approve', 'payroll:run', 'payroll:approve',
    'payment:create', 'payment:approve', 'payment:mark-paid', 'payment:export',
    'period:lock', 'recon:write', 'rate:write', 'rules:write',
    'adjustment:create', 'adjustment:recover',
    'ledger:draft', 'ledger:post', 'ledger:reverse', 'ledger:opening',
    'coa:create', 'coa:update', 'coa:deactivate',
    'budget:write'
  )
ON CONFLICT ("role_id", "permission_id") DO NOTHING;
