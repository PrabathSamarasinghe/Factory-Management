#!/usr/bin/env node
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAllSpecs } from './lib.mjs';

const COMMAND = basename(fileURLToPath(import.meta.url));

try {
  const options = parseArgs(process.argv.slice(2));
  const report = run(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (options.check) {
    if (report.drift.length === 0) {
      console.log(`OpenAPI specs are up to date (${report.fileCount} files).`);
    } else {
      console.error(`${COMMAND}: OpenAPI specs are out of date:`);
      for (const file of report.drift) {
        console.error(`- ${file}`);
      }
    }
  } else {
    console.log(`Wrote ${report.written.length} OpenAPI file(s) to ${toPosix(options.out)}.`);
    if (report.removed.length > 0) {
      console.log(`Removed ${report.removed.length} stale file(s).`);
    }
  }
  process.exitCode =
    report.status === 'pass' || (!options.check && report.status === 'written') ? 0 : 1;
} catch (error) {
  console.error(`${COMMAND}: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}

function parseArgs(argv) {
  const options = {
    root: process.cwd(),
    out: 'packages/contracts/openapi',
    check: false,
    json: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const equals = arg.indexOf('=');
    const flag = equals === -1 ? arg : arg.slice(0, equals);
    const inline = equals === -1 ? undefined : arg.slice(equals + 1);
    if (flag === '--root' || flag === '--out') {
      const value = inline ?? argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${flag} requires a value.`);
      }
      options[flag.slice(2)] = value;
      if (inline === undefined) {
        index += 1;
      }
    } else if (flag === '--check' || flag === '--json') {
      if (inline !== undefined) {
        throw new Error(`${flag} does not accept a value.`);
      }
      options[flag.slice(2)] = true;
    } else {
      throw new Error(`unknown option: ${arg}`);
    }
  }

  options.root = resolve(options.root);
  if (!existsSync(options.root) || !statSync(options.root).isDirectory()) {
    throw new Error('--root must be an existing directory.');
  }
  options.out = resolve(options.root, options.out);
  const outRelative = relative(options.root, options.out);
  if (outRelative === '' || outRelative.startsWith('..') || isAbsolute(outRelative)) {
    throw new Error('--out must be a directory inside --root.');
  }
  return options;
}

function run(options) {
  const specs = buildAllSpecs(options.root);
  const files = new Map();
  for (const name of Object.keys(specs).sort(compareStrings)) {
    files.set(`${name}.json`, serialize(specs[name]));
  }
  files.set('index.json', serialize(buildIndex(specs)));
  mkdirSync(options.out, { recursive: true });

  const existing = readdirSync(options.out)
    .filter((name) => name.endsWith('.json'))
    .sort(compareStrings);
  const drift = [];
  const written = [];
  const removed = [];

  if (options.check) {
    for (const name of [...files.keys()].sort(compareStrings)) {
      const path = join(options.out, name);
      if (!existsSync(path) || readFileSync(path, 'utf8') !== files.get(name)) {
        drift.push(name);
      }
    }
    for (const name of existing) {
      if (!files.has(name)) {
        drift.push(name);
      }
    }
    drift.sort(compareStrings);
  } else {
    for (const name of [...files.keys()].sort(compareStrings)) {
      writeFileSync(join(options.out, name), files.get(name), 'utf8');
      written.push(name);
    }
    for (const name of existing) {
      if (!files.has(name)) {
        rmSync(join(options.out, name), { force: true });
        removed.push(name);
      }
    }
  }

  return {
    root: toPosix(options.root),
    out: toPosix(options.out),
    check: options.check,
    status: options.check ? (drift.length === 0 ? 'pass' : 'drift') : 'written',
    fileCount: files.size,
    written,
    removed,
    drift,
  };
}

function buildIndex(specs) {
  return {
    generator: 'tools/openapi/generate.mjs',
    services: Object.keys(specs)
      .sort(compareStrings)
      .map((name) => ({
        name,
        spec: `${name}.json`,
        basePath: specs[name].servers[0].url,
        operationCount: countOperations(specs[name]),
      })),
  };
}

function countOperations(spec) {
  let count = 0;
  for (const pathItem of Object.values(spec.paths)) {
    count += Object.keys(pathItem).length;
  }
  return count;
}

function serialize(value) {
  return `${formatJson(value, 0)}\n`;
}

function formatJson(value, indent) {
  const padding = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return '[]';
    }
    if (value.every((item) => !isContainer(item))) {
      const inline = `[${value.map((item) => JSON.stringify(item)).join(', ')}]`;
      if (padding.length + inline.length <= 100) {
        return inline;
      }
    }
    const entries = value.map((item) => `${padding}  ${formatJson(item, indent + 2)}`);
    return `[\n${entries.join(',\n')}\n${padding}]`;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value);
    if (entries.length === 0) {
      return '{}';
    }
    const lines = entries.map(
      ([key, item]) => `${padding}  ${JSON.stringify(key)}: ${formatJson(item, indent + 2)}`,
    );
    return `{\n${lines.join(',\n')}\n${padding}}`;
  }
  return JSON.stringify(value);
}

function isContainer(value) {
  return typeof value === 'object' && value !== null;
}

function compareStrings(left, right) {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function toPosix(path) {
  return path.split(sep).join('/');
}
