\set ON_ERROR_STOP on

\echo schema inventory
SELECT
  schema_name,
  schema_name IN (
    'pg_catalog',
    'information_schema',
    'pg_toast',
    'auth',
    'storage',
    'extensions',
    'realtime',
    'vault'
  ) AS system_or_supabase_managed
FROM information_schema.schemata
ORDER BY system_or_supabase_managed, schema_name;

\echo core table row counts
SELECT format(
  'SELECT %L AS schema_name, %L AS table_name, count(*) AS row_count FROM %I.%I',
  t.table_schema,
  t.table_name,
  t.table_schema,
  t.table_name
) AS verification_query
FROM information_schema.tables AS t
WHERE t.table_type = 'BASE TABLE'
  AND (t.table_schema, t.table_name) IN (
    VALUES ('identity', 'users'),
      ('identity', 'roles'),
      ('identity', 'user_roles'),
      ('identity', 'sessions'),
      ('identity', 'auth_audit'),
      ('people', 'persons'),
      ('people', 'consents'),
      ('attendance', 'face_templates'),
      ('attendance', 'attendance_events'),
      ('attendance', 'attendance_audit_logs'),
      ('fleet', 'trips'),
      ('collection', 'pickups'),
      ('collection', 'factory_weighings'),
      ('notification', 'sms_messages'),
      ('realtime_service', 'webhook_subscriptions'),
      ('accounts', 'accounts'),
      ('accounts', 'journal_entries'),
      ('accounts', 'journal_lines'),
      ('accounts', 'parties'),
      ('accounts', 'outbox_events'),
      ('inventory', 'stock_movements'),
      ('reporting', 'rpt_finance_snapshot')
  )
ORDER BY t.table_schema, t.table_name
\gexec

\echo journal balance check
SELECT
  je.entry_no,
  je.entry_date,
  je.status::text AS status,
  COALESCE(SUM(jl.debit - jl.credit), 0) AS imbalance,
  bool_or(jl.id IS NULL) AS missing_lines
FROM accounts.journal_entries AS je
LEFT JOIN accounts.journal_lines AS jl ON jl.entry_id = je.id
GROUP BY je.id, je.entry_no, je.entry_date, je.status
HAVING COALESCE(SUM(jl.debit - jl.credit), 0) <> 0
  OR bool_or(jl.id IS NULL)
ORDER BY je.entry_date DESC, je.entry_no;

\echo immutability trigger existence
WITH expected(event_object_table, trigger_name) AS (
  VALUES ('journal_lines', 'journal_lines_balanced'),
    ('journal_entries', 'journal_entries_immutable'),
    ('journal_lines', 'journal_lines_immutable')
)
SELECT
  e.event_object_table,
  e.trigger_name,
  t.trigger_name IS NOT NULL AS present,
  COALESCE(array_agg(DISTINCT t.event_manipulation), ARRAY[]::text[]) AS events
FROM expected AS e
LEFT JOIN information_schema.triggers AS t
  ON t.event_object_schema = 'accounts'
  AND t.event_object_table = e.event_object_table
  AND t.trigger_name = e.trigger_name
GROUP BY e.event_object_table, e.trigger_name
ORDER BY e.event_object_table, e.trigger_name;

\echo duplicate party and user checks
SELECT 'accounts.parties' AS check_name, external_id AS duplicate_value, count(*) AS occurrences
FROM accounts.parties
WHERE external_id IS NOT NULL
GROUP BY external_id
HAVING count(*) > 1
UNION ALL
SELECT 'identity.users.username', username::text, count(*)
FROM identity.users
GROUP BY username::text
HAVING count(*) > 1
UNION ALL
SELECT 'identity.users.email', email::text, count(*)
FROM identity.users
WHERE email IS NOT NULL
GROUP BY email::text
HAVING count(*) > 1
UNION ALL
SELECT 'people.persons.code', code, count(*)
FROM people.persons
GROUP BY code
HAVING count(*) > 1
ORDER BY check_name, duplicate_value;

\echo latest migration rows
SELECT format(
  'SELECT %L AS schema_name, migration_name, finished_at, applied_steps_count, success FROM %I._prisma_migrations ORDER BY finished_at DESC NULLS LAST LIMIT 5',
  t.table_schema,
  t.table_schema
) AS verification_query
FROM information_schema.tables AS t
WHERE t.table_name = '_prisma_migrations'
  AND t.table_type = 'BASE TABLE'
ORDER BY t.table_schema
\gexec
