#!/usr/bin/env node
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(ROOT, 'services', 'identity-service', 'package.json'));
const { Client } = require('pg');

const urlEnv = option('--url-env') ?? 'DIRECT_URL';
const schemas = option('--schema')?.split(',') ?? ['public'];
const connectionString = process.env[urlEnv];

if (!connectionString) {
  process.stderr.write(`${urlEnv} is not set.\n`);
  process.exit(2);
}

const client = new Client({
  connectionString,
  ssl: process.argv.includes('--allow-self-signed')
    ? { rejectUnauthorized: false }
    : { rejectUnauthorized: true },
});

try {
  await client.connect();
  const tables = await client.query(
    `select table_schema as schema, table_name as table
       from information_schema.tables
      where table_schema = any($1::text[]) and table_type = 'BASE TABLE'
      order by table_schema, table_name`,
    [schemas],
  );
  const enums = await client.query(
    `select n.nspname as schema, t.typname as enum
       from pg_type t
       join pg_namespace n on n.oid = t.typnamespace
      where n.nspname = any($1::text[]) and t.typtype = 'e'
      order by n.nspname, t.typname`,
    [schemas],
  );
  process.stdout.write(`${JSON.stringify({ tables: tables.rows, enums: enums.rows }, null, 2)}\n`);
} catch (error) {
  process.stderr.write(
    `Table inspection failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}

function option(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}
