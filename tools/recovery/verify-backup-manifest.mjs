#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_MANIFEST = 'tools/recovery/backup-manifest.example.json';
export const ENVIRONMENTS = ['prod', 'staging', 'dev'];

const REQUIRED_FIELDS = [
  'provider',
  'projectRef',
  'database',
  'schemas',
  'pitrEnabled',
  'pitrWindowHours',
  'logicalExportSchedule',
  'encryption',
  'retentionDays',
  'lastSuccessfulBackupAt',
  'lastRestoreDrillAt',
  'owner',
  'notes',
];
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const BACKUP_MAX_AGE_MS = {
  prod: 24 * HOUR,
  staging: 7 * DAY,
  dev: 7 * DAY,
};
const DRILL_MAX_AGE_MS = 90 * DAY;
const DUE_RATIO = 0.8;

const SECRET_PATTERNS = {
  assignment:
    /(password|passwd|secret|token|api[_-]?key|private[_-]?key|client[_-]?secret|refresh[_-]?token|access[_-]?key|credential|connection[_-]?string|database[_-]?url|dsn)\w*\s*[:=]\s*(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/i,
  url: /([a-z][a-z0-9+.-]*:\/\/)([^/@\s:]+):([^/@\s]+)@/i,
  pem: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/,
  token: /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])([A-Za-z0-9_-]{32,})\b/,
};

const REDACT_PATTERNS = {
  assignment:
    /(password|passwd|secret|token|api[_-]?key|private[_-]?key|client[_-]?secret|refresh[_-]?token|access[_-]?key|credential|connection[_-]?string|database[_-]?url|dsn)\w*\s*[:=]\s*(?:"[^"\n]*"|'[^'\n]*'|[^\s,;}]+)/gi,
  url: /([a-z][a-z0-9+.-]*:\/\/)([^/@\s:]+):([^/@\s]+)@/gi,
  pem: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g,
  token: /\b(?=[A-Za-z0-9_-]*\d)(?=[A-Za-z0-9_-]*[A-Za-z])([A-Za-z0-9_-]{32,})\b/g,
};

export function parseArgs(argv = process.argv.slice(2)) {
  const options = {
    manifest: DEFAULT_MANIFEST,
    asOf: new Date().toISOString(),
    json: false,
    strict: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--manifest' || argument === '--as-of') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) {
        throw new Error(`${argument} requires a value`);
      }
      options[argument === '--manifest' ? 'manifest' : 'asOf'] = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('--manifest=')) {
      options.manifest = argument.slice('--manifest='.length);
      continue;
    }
    if (argument.startsWith('--as-of=')) {
      options.asOf = argument.slice('--as-of='.length);
      continue;
    }
    if (argument === '--json') {
      options.json = true;
      continue;
    }
    if (argument === '--strict') {
      options.strict = true;
      continue;
    }
    throw new Error(`unknown option: ${argument}`);
  }

  if (!options.manifest) {
    throw new Error('--manifest requires a value');
  }
  const asOfTime = Date.parse(options.asOf);
  if (!Number.isFinite(asOfTime)) {
    throw new Error('--as-of must be an ISO date');
  }
  options.asOf = new Date(asOfTime).toISOString();
  return options;
}

export function redact(value) {
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  if (text === undefined) {
    return '';
  }
  text = text
    .replace(REDACT_PATTERNS.pem, '<redacted>')
    .replace(REDACT_PATTERNS.url, '$1<redacted>@')
    .replace(REDACT_PATTERNS.assignment, '$1=<redacted>')
    .replace(REDACT_PATTERNS.token, '<redacted>');
  return text;
}

export function validateManifest(manifest, asOf = new Date()) {
  const asOfDate = asOf instanceof Date ? asOf : new Date(asOf);
  const checks = [];

  if (!isObject(manifest)) {
    addCheck(checks, {
      id: 'manifest',
      environment: '-',
      field: 'root',
      status: 'fail',
      message: 'manifest must be a JSON object',
      value: manifest,
    });
    return summarise(checks, asOfDate);
  }

  if (!isObject(manifest.environments)) {
    addCheck(checks, {
      id: 'environments',
      environment: '-',
      field: 'environments',
      status: 'fail',
      message: 'manifest must contain an environments object',
      value: manifest.environments,
    });
    return summarise(checks, asOfDate);
  }

  for (const name of ENVIRONMENTS) {
    const environment = manifest.environments[name];
    if (!isObject(environment)) {
      addCheck(checks, {
        id: `environment.${name}`,
        environment: name,
        field: 'entry',
        status: 'fail',
        message: `${name} environment entry is missing`,
        value: environment,
      });
      continue;
    }
    validateEnvironment(checks, name, environment, asOfDate);
  }

  return summarise(checks, asOfDate);
}

export function formatReport(report, options = {}) {
  if (options.json) {
    return JSON.stringify(report, null, 2);
  }

  const lines = [
    'Backup manifest verification',
    `Manifest: ${redact(report.manifest)}`,
    `As of: ${report.asOf}`,
    '',
  ];
  for (const check of report.checks) {
    const status = check.status.toUpperCase().padEnd(8);
    const dueAt = check.dueAt ? ` | due by: ${redact(check.dueAt)}` : '';
    lines.push(`[${status}] ${check.id}: ${check.message} | value: ${redact(check.value)}${dueAt}`);
  }
  lines.push('');
  lines.push(
    `Summary: ok=${report.summary.ok} due=${report.summary.due} overdue=${report.summary.overdue} fail=${report.summary.fail}`,
  );
  if (options.strict) {
    lines.push(`Strict mode: ${report.summary.failed === 0 ? 'PASS' : 'FAIL'}`);
  }
  return lines.join('\n');
}

export function run(argv = process.argv.slice(2)) {
  let options;
  try {
    options = parseArgs(argv);
  } catch (error) {
    console.error(`error: ${error.message}`);
    return 1;
  }

  let manifest;
  try {
    manifest = JSON.parse(readFileSync(resolve(options.manifest), 'utf8'));
  } catch (error) {
    console.error(`error: cannot read manifest: ${error.message}`);
    return 1;
  }

  const report = {
    manifest: options.manifest,
    ...validateManifest(manifest, options.asOf),
  };
  console.log(formatReport(report, options));
  return options.strict && report.summary.failed > 0 ? 1 : 0;
}

function validateEnvironment(checks, name, environment, asOfDate) {
  for (const field of REQUIRED_FIELDS) {
    if (isMissing(environment[field])) {
      addCheck(checks, {
        id: `${name}.${field}`,
        environment: name,
        field,
        status: 'fail',
        message: 'required field is missing',
        value: environment[field],
      });
    }
  }

  checkString(checks, name, environment, 'provider');
  checkString(checks, name, environment, 'projectRef');
  checkString(checks, name, environment, 'database');
  checkString(checks, name, environment, 'logicalExportSchedule');
  checkString(checks, name, environment, 'owner');
  checkString(checks, name, environment, 'notes');

  if (!isMissing(environment.schemas)) {
    const schemasValid =
      Array.isArray(environment.schemas) &&
      environment.schemas.length > 0 &&
      environment.schemas.every((schema) => typeof schema === 'string' && schema.trim());
    addCheck(checks, {
      id: `${name}.schemas`,
      environment: name,
      field: 'schemas',
      status: schemasValid ? 'ok' : 'fail',
      message: schemasValid ? 'schema list is valid' : 'schemas must be a non-empty string array',
      value: environment.schemas,
    });
  }

  if (!isMissing(environment.pitrEnabled)) {
    const value = environment.pitrEnabled;
    const status = typeof value === 'boolean' && (name === 'dev' || value === true) ? 'ok' : 'fail';
    addCheck(checks, {
      id: `${name}.pitrEnabled`,
      environment: name,
      field: 'pitrEnabled',
      status,
      message:
        status === 'ok'
          ? 'PITR setting satisfies the environment policy'
          : 'PITR must be true for staging and prod',
      value,
    });
  }

  checkMinimumNumber(checks, name, environment, 'pitrWindowHours', 24, 'hours');
  checkMinimumNumber(checks, name, environment, 'retentionDays', 30, 'days');

  if (!isMissing(environment.encryption)) {
    const status = environment.encryption === true ? 'ok' : 'fail';
    addCheck(checks, {
      id: `${name}.encryption`,
      environment: name,
      field: 'encryption',
      status,
      message: status === 'ok' ? 'encryption confirmed' : 'encryption must be true',
      value: environment.encryption,
    });
  }

  checkFreshness(
    checks,
    name,
    environment,
    'lastSuccessfulBackupAt',
    BACKUP_MAX_AGE_MS[name],
    'last successful backup',
    asOfDate,
  );
  checkFreshness(
    checks,
    name,
    environment,
    'lastRestoreDrillAt',
    DRILL_MAX_AGE_MS,
    'last restore drill',
    asOfDate,
  );

  if (!isMissing(environment.notes)) {
    const hasSecret = containsSecret(environment.notes);
    addCheck(checks, {
      id: `${name}.notes.secrets`,
      environment: name,
      field: 'notes',
      status: hasSecret ? 'fail' : 'ok',
      message: hasSecret ? 'notes contain an unredacted secret' : 'no secret patterns detected',
      value: environment.notes,
    });
  }
}

function checkString(checks, name, environment, field) {
  if (isMissing(environment[field])) {
    return;
  }
  const status = typeof environment[field] === 'string' ? 'ok' : 'fail';
  addCheck(checks, {
    id: `${name}.${field}`,
    environment: name,
    field,
    status,
    message: status === 'ok' ? 'value is a non-empty string' : 'must be a non-empty string',
    value: environment[field],
  });
}

function checkMinimumNumber(checks, name, environment, field, minimum, unit) {
  if (isMissing(environment[field])) {
    return;
  }
  const value = environment[field];
  const valid = typeof value === 'number' && Number.isFinite(value) && value >= minimum;
  addCheck(checks, {
    id: `${name}.${field}`,
    environment: name,
    field,
    status: valid ? 'ok' : 'fail',
    message: valid ? `meets the ${minimum} ${unit} minimum` : `must be at least ${minimum} ${unit}`,
    value,
  });
}

function checkFreshness(checks, name, environment, field, maximumAgeMs, label, asOfDate) {
  if (isMissing(environment[field])) {
    return;
  }
  const value = environment[field];
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) {
    addCheck(checks, {
      id: `${name}.${field}`,
      environment: name,
      field,
      status: 'fail',
      message: `${label} must be an ISO date`,
      value,
    });
    return;
  }
  if (timestamp > asOfDate.getTime()) {
    addCheck(checks, {
      id: `${name}.${field}`,
      environment: name,
      field,
      status: 'fail',
      message: `${label} must not be in the future`,
      value,
    });
    return;
  }

  const age = asOfDate.getTime() - timestamp;
  const dueAt = new Date(asOfDate.getTime() - maximumAgeMs).toISOString();
  const status = age > maximumAgeMs ? 'overdue' : age > maximumAgeMs * DUE_RATIO ? 'due' : 'ok';
  const message =
    status === 'overdue'
      ? `${label} deadline has passed`
      : status === 'due'
        ? `${label} renewal is due soon`
        : `${label} is within policy`;
  addCheck(checks, {
    id: `${name}.${field}`,
    environment: name,
    field,
    status,
    message,
    value,
    dueAt,
  });
}

function containsSecret(value) {
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  if (!text) {
    return false;
  }
  return Object.values(SECRET_PATTERNS).some((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  });
}

function addCheck(checks, check) {
  checks.push({
    ...check,
    value: redact(check.value),
    ...(check.dueAt ? { dueAt: redact(check.dueAt) } : {}),
  });
}

function summarise(checks, asOfDate) {
  const summary = { ok: 0, due: 0, overdue: 0, fail: 0, failed: 0 };
  for (const check of checks) {
    summary[check.status] += 1;
    if (check.status === 'overdue' || check.status === 'fail') {
      summary.failed += 1;
    }
  }
  return { asOf: asOfDate.toISOString(), checks, summary };
}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isMissing(value) {
  if (value === undefined || value === null) {
    return true;
  }
  if (typeof value === 'string' && value.trim() === '') {
    return true;
  }
  return Array.isArray(value) && value.length === 0;
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === fileURLToPath(import.meta.url)) {
  process.exitCode = run(process.argv.slice(2));
}
