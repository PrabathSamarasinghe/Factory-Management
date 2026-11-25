#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildClientFiles } from './lib.mjs';

const COMMAND = basename(fileURLToPath(import.meta.url));

try {
  const options = parseArgs(process.argv.slice(2));
  const report = run(options);
  if (options.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else if (options.check) {
    if (report.drift.length === 0) {
      console.log(`Generated clients are up to date (${report.fileCount} files).`);
    } else {
      console.error(`${COMMAND}: generated clients are out of date:`);
      for (const file of report.drift) {
        console.error(`- ${file}`);
      }
    }
  } else {
    console.log(`Wrote ${report.written.length} generated client file(s).`);
  }
  process.exitCode =
    report.status === 'pass' || (!options.check && report.status === 'written') ? 0 : 1;
} catch (error) {
  console.error(`${COMMAND}: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
}

function parseArgs(argv) {
  const options = { root: process.cwd(), check: false, json: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const equals = arg.indexOf('=');
    const flag = equals === -1 ? arg : arg.slice(0, equals);
    const inline = equals === -1 ? undefined : arg.slice(equals + 1);
    if (flag === '--root') {
      const value = inline ?? argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error('--root requires a value.');
      }
      options.root = value;
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
  return options;
}

function run(options) {
  const files = buildClientFiles(options.root);
  const drift = [];
  const written = [];

  for (const [name, content] of [...files.entries()].sort(([left], [right]) =>
    compareStrings(left, right),
  )) {
    const path = join(options.root, ...name.split('/'));
    if (options.check) {
      if (!existsSync(path) || readFileSync(path, 'utf8') !== content) {
        drift.push(name);
      }
      continue;
    }
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, 'utf8');
    written.push(name);
  }

  return {
    root: toPosix(options.root),
    check: options.check,
    status: options.check ? (drift.length === 0 ? 'pass' : 'drift') : 'written',
    fileCount: files.size,
    written,
    drift: drift.sort(compareStrings),
  };
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
