#!/usr/bin/env node
import { createRequire } from 'node:module';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const require = createRequire(join(ROOT, 'services', 'identity-service', 'package.json'));
const { Client } = require('pg');

const urlEnv = process.argv.includes('--url-env')
  ? process.argv[process.argv.indexOf('--url-env') + 1]
  : 'DIRECT_URL';
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
  const result = await client.query(
    `select table_schema as schema, table_name as table
       from information_schema.tables
      where table_name = '_prisma_migrations'
      order by table_schema`,
  );
  process.stdout.write(`${JSON.stringify(result.rows, null, 2)}\n`);
} catch (error) {
  process.stderr.write(
    `Migration table inspection failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
} finally {
  await client.end().catch(() => undefined);
}
