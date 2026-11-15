#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import { basename, dirname, join, relative, resolve } from 'node:path';

const root = resolve(getOption('--root') ?? process.cwd());
const schemaOption = getOption('--schema');
const staticOnly = process.argv.includes('--static');
const failures = [];
const checked = [];

const schemas = schemaOption
  ? [resolve(root, schemaOption)]
  : discoverSchemas(join(root, 'services'));

if (schemas.length === 0) {
  console.log('No service Prisma schemas found; migration check skipped.');
  process.exit(0);
}

for (const schema of schemas) {
  const result = checkService(root, schema, staticOnly);
  checked.push(result.name);
  if (!result.ok) {
    failures.push(result);
  }
}

if (failures.length > 0) {
  console.error('\nPrisma migration check failed:');
  for (const failure of failures) {
    for (const message of failure.messages) {
      console.error(`- ${failure.name}: ${message}`);
    }
  }
  process.exit(1);
}

console.log(`Prisma migration check passed for: ${checked.join(', ')}.`);

function checkService(rootDir, schemaPath, staticsOnly) {
  const name = basename(dirname(dirname(schemaPath)));
  const messages = [];
  const serviceRoot = dirname(dirname(schemaPath));
  const migrations = join(dirname(schemaPath), 'migrations');
  const expectedSchema = join(serviceRoot, 'prisma', 'schema.prisma');

  if (schemaPath !== expectedSchema) {
    messages.push(`schema must live at services/${name}/prisma/schema.prisma.`);
  }

  if (!hasPrismaConfig(serviceRoot)) {
    messages.push('missing prisma.config.ts (datasource URL belongs there in Prisma 7).');
  }

  if (!existsSync(migrations)) {
    messages.push(
      'missing prisma/migrations; create an initial migration with prisma migrate dev.',
    );
  } else {
    const entries = readdirSync(migrations, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();

    if (entries.length === 0) {
      messages.push('prisma/migrations is empty; commit the initial migration SQL.');
    }
    if (!existsSync(join(migrations, 'migration_lock.toml'))) {
      messages.push('missing prisma/migrations/migration_lock.toml.');
    }

    for (const entry of entries) {
      if (!/^\d{14}_[a-z0-9_]+$/.test(entry)) {
        messages.push(`migration folder "${entry}" must match YYYYMMDDHHMMSS_name.`);
      }
      if (!existsSync(join(migrations, entry, 'migration.sql'))) {
        messages.push(`migration "${entry}" is missing migration.sql.`);
      }
    }
  }

  if (messages.length > 0 || staticsOnly) {
    return { name, ok: messages.length === 0, messages };
  }

  if (!process.env.DATABASE_URL) {
    messages.push('DATABASE_URL is required for the migration drift check.');
    return { name, ok: false, messages };
  }

  const prismaCli = resolvePrismCli(rootDir);
  if (!prismaCli) {
    messages.push('prisma CLI is not installed; run pnpm install.');
    return { name, ok: false, messages };
  }

  console.log(`\nChecking ${name} migrations against schema...`);
  const diff = spawnSync(
    process.execPath,
    [
      prismaCli,
      'migrate',
      'diff',
      `--from-migrations=${migrations}`,
      `--to-schema=${schemaPath}`,
      '--exit-code',
    ],
    {
      cwd: serviceRoot,
      env: process.env,
      stdio: 'inherit',
    },
  );

  if (diff.error) {
    messages.push(`failed to run prisma migrate diff: ${diff.error.message}`);
  } else if (diff.status === 2) {
    messages.push('schema.prisma and prisma/migrations are out of sync; create a migration.');
  } else if (diff.status !== 0) {
    messages.push(`prisma migrate diff failed with exit code ${diff.status}.`);
  }

  return { name, ok: messages.length === 0, messages };
}

function discoverSchemas(servicesRoot) {
  if (!existsSync(servicesRoot)) {
    return [];
  }

  const schemas = [];
  for (const service of readdirSync(servicesRoot, { withFileTypes: true })) {
    if (!service.isDirectory() || service.name.startsWith('.')) {
      continue;
    }
    const serviceRoot = join(servicesRoot, service.name);
    const found = findSchemaFiles(serviceRoot);
    if (found.length > 1) {
      console.error(`Multiple Prisma schemas found in ${relative(root, serviceRoot)}:`);
      for (const schema of found) {
        console.error(`- ${relative(root, schema)}`);
      }
      console.error('Keep one schema.prisma per service.');
      process.exit(1);
    }
    if (found.length === 1) {
      schemas.push(found[0]);
    }
  }
  return schemas;
}

function findSchemaFiles(dir) {
  const found = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skipDirectory(entry.name)) {
      continue;
    }
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...findSchemaFiles(path));
    } else if (entry.name === 'schema.prisma') {
      found.push(path);
    }
  }
  return found;
}

function skipDirectory(name) {
  return (
    name === 'node_modules' ||
    name === 'dist' ||
    name === 'build' ||
    name === 'coverage' ||
    name === 'generated' ||
    name.startsWith('.')
  );
}

function hasPrismaConfig(serviceRoot) {
  return (
    existsSync(join(serviceRoot, 'prisma.config.ts')) ||
    existsSync(join(serviceRoot, 'prisma7.config.ts'))
  );
}

function resolvePrismCli(rootDir) {
  try {
    const require = createRequire(join(rootDir, 'package.json'));
    const packagePath = require.resolve('prisma/package.json');
    const manifest = JSON.parse(readFileSync(packagePath, 'utf8'));
    const bin = typeof manifest.bin === 'string' ? manifest.bin : manifest.bin?.prisma;
    return bin ? join(dirname(packagePath), bin) : undefined;
  } catch {
    return undefined;
  }
}

function getOption(name) {
  const index = process.argv.indexOf(name);
  return index === -1 ? undefined : process.argv[index + 1];
}
