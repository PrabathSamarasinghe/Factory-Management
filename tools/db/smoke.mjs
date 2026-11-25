#!/usr/bin/env node
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '..', '..');
const require = createRequire(join(ROOT, 'services', 'identity-service', 'package.json'));
const { Client } = require('pg');

const EXPECTED_SCHEMAS = [
  'identity',
  'people',
  'attendance',
  'fleet',
  'collection',
  'notification',
  'realtime_service',
  'accounts',
  'inventory',
  'reporting',
];

const options = parseArgs(process.argv.slice(2));
const connectionString = process.env[options.urlEnv];

if (!connectionString) {
  process.stderr.write(`${options.urlEnv} is not set.\n`);
  process.exit(2);
}

const client = new Client({
  connectionString,
  ssl: options.noSsl ? undefined : { rejectUnauthorized: !options.allowSelfSigned },
});

try {
  await client.connect();

  const identity = await client.query(
    'select current_database() as database, current_user as role, version() as version',
  );
  const searchPath = await client.query('show search_path');
  const schemas = await client.query(
    'select schema_name from information_schema.schemata where schema_name = any($1::text[]) order by schema_name',
    [EXPECTED_SCHEMAS],
  );
  const schemaOwners = await client.query(
    `select nspname as schema, pg_get_userbyid(nspowner) as owner
       from pg_namespace
      where nspname = any($1::text[])
      order by nspname`,
    [EXPECTED_SCHEMAS],
  );
  const tables = await client.query(
    `select table_schema as schema, count(*)::int as tables
       from information_schema.tables
      where table_schema = any($1::text[]) and table_type = 'BASE TABLE'
      group by table_schema
      order by table_schema`,
    [EXPECTED_SCHEMAS],
  );
  const extensions = await client.query(
    `select extname as extension
       from pg_extension
      where extname in ('pgcrypto', 'uuid-ossp')
      order by extname`,
  );

  const present = schemas.rows.map((row) => row.schema_name);
  const missing = EXPECTED_SCHEMAS.filter((schema) => !present.includes(schema));
  const report = {
    status: missing.length === 0 ? 'pass' : 'fail',
    database: identity.rows[0].database,
    role: identity.rows[0].role,
    version: identity.rows[0].version,
    searchPath: searchPath.rows[0].search_path,
    expectedSchemas: EXPECTED_SCHEMAS,
    presentSchemas: present,
    missingSchemas: missing,
    schemaOwners: Object.fromEntries(schemaOwners.rows.map((row) => [row.schema, row.owner])),
    tablesBySchema: Object.fromEntries(tables.rows.map((row) => [row.schema, row.tables])),
    extensions: extensions.rows.map((row) => row.extension),
  };

  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(
      [
        `Database smoke: ${report.status.toUpperCase()}`,
        `database=${report.database} role=${report.role}`,
        `search_path=${report.searchPath}`,
        `schemas_present=${report.presentSchemas.join(',') || 'none'}`,
        `schemas_missing=${report.missingSchemas.join(',') || 'none'}`,
        `schema_owners=${JSON.stringify(report.schemaOwners)}`,
        `tables=${JSON.stringify(report.tablesBySchema)}`,
        `extensions=${report.extensions.join(',') || 'none'}`,
      ].join('\n') + '\n',
    );
  }

  if (missing.length > 0) process.exitCode = 1;
} catch (error) {
  process.stderr.write(
    `Database smoke failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}

function parseArgs(argv) {
  const options = { urlEnv: 'DIRECT_URL', json: false, noSsl: false, allowSelfSigned: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--url-env') {
      const value = argv[index + 1];
      if (!value) throw new Error('--url-env requires a variable name');
      options.urlEnv = value;
      index += 1;
    } else if (arg.startsWith('--url-env=')) {
      options.urlEnv = arg.slice('--url-env='.length);
    } else if (arg === '--json') {
      options.json = true;
    } else if (arg === '--no-ssl') {
      options.noSsl = true;
    } else if (arg === '--allow-self-signed') {
      options.allowSelfSigned = true;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }
  return options;
}
