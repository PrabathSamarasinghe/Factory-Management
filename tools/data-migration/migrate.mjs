#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { buildPlan, parseArgs, redactPerson, summarize, validateManifest } from './lib.mjs';

const USAGE = [
  'Usage: node tools/data-migration/migrate.mjs --manifest <path> [options]',
  '',
  'Modes (default: --validate):',
  '  --validate                     Validate the manifest and print a PII-free summary',
  '  --dry-run                      Build and display a redacted plan without network calls',
  '  --apply                        POST people, parties and the opening journal',
  '',
  'Options:',
  '  --people-url <url>             People service base URL (required with --apply)',
  '  --accounts-url <url>           Accounts service base URL (required with --apply)',
  '  --token-env <name>             Environment variable holding the bearer token',
  '  --json                         Emit the result as JSON',
  '  --out <path>                   Write the JSON result to a file',
].join('\n');

class CliError extends Error {}

function isObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function fail(message, exitCode = 1, usage = false) {
  process.stderr.write(`${message}\n${usage ? `\n${USAGE}\n` : ''}`);
  process.exitCode = exitCode;
}

async function loadManifest(path) {
  if (!path) throw new CliError('--manifest is required.');
  let text;
  try {
    text = await readFile(resolve(process.cwd(), path), 'utf8');
  } catch {
    throw new CliError('Cannot read the manifest file.');
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new CliError('The manifest file is not valid JSON.');
  }
}

function formatSummary(summary) {
  return [
    `environment=${summary.environment} asOfDate=${summary.asOfDate}`,
    `people=${summary.people} parties=${summary.parties} journalLines=${summary.openingJournalLines}`,
    `debits=${summary.debitTotal} credits=${summary.creditTotal} balanced=${summary.balanced ? 'yes' : 'no'}`,
  ].join('\n');
}

async function emit(args, payload, text) {
  if (args.out) {
    await writeFile(
      resolve(process.cwd(), args.out),
      `${JSON.stringify(payload, null, 2)}\n`,
      'utf8',
    );
  }
  process.stdout.write(args.json ? `${JSON.stringify(payload, null, 2)}\n` : `${text}\n`);
}

function mode(args) {
  if (args.apply) return 'apply';
  if (args.dryRun) return 'dry-run';
  return 'validate';
}

function isLocalHost(host) {
  const normalized = host.replace(/^\[|\]$/g, '').toLowerCase();
  return (
    normalized === 'localhost' ||
    normalized === '127.0.0.1' ||
    normalized === '::1' ||
    normalized.endsWith('.localhost')
  );
}

function baseUrl(value, flag) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new CliError(`${flag} must be a valid URL.`);
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new CliError(`${flag} must use http or https.`);
  }
  if (parsed.username || parsed.password) {
    throw new CliError(`${flag} must not embed credentials.`);
  }
  if (
    parsed.protocol === 'http:' &&
    !isLocalHost(parsed.hostname) &&
    process.env.DATA_MIGRATION_ALLOW_INSECURE !== '1'
  ) {
    throw new CliError(
      `${flag} uses non-local http; set DATA_MIGRATION_ALLOW_INSECURE=1 to allow it.`,
    );
  }
  return parsed.toString().replace(/\/+$/, '');
}

function authHeaders(token, extra = {}) {
  return {
    accept: 'application/json',
    'content-type': 'application/json',
    authorization: `Bearer ${token}`,
    ...extra,
  };
}

async function postJson(url, body, headers) {
  try {
    const response = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
    let data = null;
    try {
      data = await response.json();
    } catch {
      data = null;
    }
    return { ok: response.ok, status: response.status, data };
  } catch (error) {
    return { ok: false, status: 0, error: error?.name ?? 'Error' };
  }
}

function rowResult(type, externalId, result, extra = {}) {
  return {
    type,
    externalId,
    ok: result.ok,
    status: result.status ?? 0,
    ...(result.error ? { error: result.error } : {}),
    ...extra,
  };
}

async function loadAccountIds(accountsUrl, headers) {
  try {
    const response = await fetch(`${accountsUrl}/accounts/tree`, { headers });
    if (!response.ok) return { ok: false, status: response.status };
    const payload = await response.json();
    const roots = Array.isArray(payload)
      ? payload
      : Array.isArray(payload?.data)
        ? payload.data
        : [];
    const byCode = new Map();
    const visit = (nodes) => {
      for (const node of nodes) {
        if (!isObject(node)) continue;
        if (typeof node.code === 'string' && typeof node.id === 'string') {
          byCode.set(node.code, node.id);
        }
        if (Array.isArray(node.children)) visit(node.children);
      }
    };
    visit(roots);
    return { ok: true, byCode };
  } catch (error) {
    return { ok: false, status: 0, error: error?.name ?? 'Error' };
  }
}

function buildDryRunSteps(plan) {
  const people = plan.personUpserts.map((person) => {
    const safe = redactPerson(person);
    delete safe.code;
    return {
      type: 'person',
      externalId: person.externalId,
      personType: person.personType,
      idempotencyKey: person.idempotencyKey,
      data: safe,
    };
  });
  const parties = plan.partyUpserts.map((party) => ({
    type: 'party',
    externalId: party.externalId,
    partyType: party.partyType,
    idempotencyKey: party.idempotencyKey,
    displayName: '***',
  }));
  const journal = {
    type: 'opening-journal',
    idempotencyKey: plan.openingJournal.idempotencyKey,
    entryDate: plan.openingJournal.entryDate,
    lines: plan.openingJournal.lines.map((line) => ({
      externalId: line.externalId,
      partyType: line.partyType,
      accountCode: line.accountCode,
      debit: line.debit,
      credit: line.credit,
      idempotencyKey: line.idempotencyKey,
    })),
  };
  return [...people, ...parties, journal];
}

function formatDryRunSteps(steps) {
  return steps
    .map((step) => {
      if (step.type === 'opening-journal') {
        return `opening-journal lines=${step.lines.length} key=${step.idempotencyKey}`;
      }
      return `${step.type} externalId=${step.externalId} type=${step.personType ?? step.partyType} key=${step.idempotencyKey}`;
    })
    .join('\n');
}

async function runApply(args, plan) {
  if (!args.peopleUrl || !args.accountsUrl) {
    throw new CliError('--apply requires --people-url and --accounts-url.');
  }
  if (!args.tokenEnv) throw new CliError('--apply requires --token-env.');
  const token = process.env[args.tokenEnv];
  if (!token) throw new CliError(`Environment variable ${args.tokenEnv} is not set.`);

  const peopleUrl = baseUrl(args.peopleUrl, '--people-url');
  const accountsUrl = baseUrl(args.accountsUrl, '--accounts-url');
  const results = [];
  const personIds = new Map();

  for (const person of plan.personUpserts) {
    const { idempotencyKey, ...body } = person;
    const response = await postJson(
      `${peopleUrl}/persons`,
      body,
      authHeaders(token, { 'Idempotency-Key': idempotencyKey }),
    );
    const personId = response.data?.id ?? response.data?.data?.id;
    if (response.ok && typeof personId === 'string') {
      personIds.set(person.externalId, personId);
    }
    results.push(rowResult('person', person.externalId, response));
  }

  const partyIds = new Map();
  for (const party of plan.partyUpserts) {
    const { idempotencyKey, ...body } = party;
    const response = await postJson(
      `${accountsUrl}/parties`,
      body,
      authHeaders(token, { 'Idempotency-Key': idempotencyKey }),
    );
    const partyId = response.data?.data?.id ?? response.data?.id;
    const resolved = response.ok && typeof partyId === 'string';
    if (resolved) partyIds.set(`${party.partyType}:${party.externalId}`, partyId);
    results.push(
      rowResult('party', party.externalId, response, {
        ...(resolved ? {} : { error: response.error ?? 'missing party id' }),
      }),
    );
  }

  const accounts = await loadAccountIds(accountsUrl, authHeaders(token));
  if (!accounts.ok) {
    results.push({
      type: 'opening-journal',
      externalId: null,
      ok: false,
      status: accounts.status ?? 0,
      error: accounts.error ?? 'account lookup failed',
    });
  } else {
    const unresolved = [];
    const lines = plan.openingJournal.lines.map((line, index) => {
      const accountId = accounts.byCode.get(line.accountCode);
      const partyId = partyIds.get(`${line.partyType}:${line.externalId}`);
      if (!accountId) unresolved.push(`line ${index + 1}: account code not found`);
      if (!partyId) unresolved.push(`line ${index + 1}: party unavailable`);
      return {
        accountId,
        partyType: line.partyType,
        partyId,
        debit: line.debit,
        credit: line.credit,
        ...(line.memo === undefined ? {} : { memo: line.memo }),
      };
    });

    if (unresolved.length > 0) {
      results.push({
        type: 'opening-journal',
        externalId: null,
        ok: false,
        status: 0,
        error: 'unresolved opening references',
        unresolved,
      });
    } else {
      const response = await postJson(
        `${accountsUrl}/journal-entries/opening`,
        { ...plan.openingJournal, lines },
        authHeaders(token, { 'Idempotency-Key': plan.openingJournal.idempotencyKey }),
      );
      results.push(rowResult('opening-journal', null, response));
    }
  }

  const failures = results.filter((row) => !row.ok);
  const payload = {
    mode: 'apply',
    status: failures.length === 0 ? 'applied' : 'failed',
    summary: summarize(plan),
    attempted: results.length,
    succeeded: results.length - failures.length,
    failed: failures.length,
    personIdMap: Object.fromEntries(personIds),
    results,
    failures,
  };
  const lines = [
    `Apply ${payload.status}: attempted=${payload.attempted} succeeded=${payload.succeeded} failed=${payload.failed}`,
    formatSummary(payload.summary),
    ...failures.map(
      (row) =>
        `- ${row.type} externalId=${row.externalId ?? 'n/a'} status=${row.status} ${row.error ?? 'request failed'}`,
    ),
  ];
  await emit(args, payload, lines.join('\n'));
  if (failures.length > 0) process.exitCode = 1;
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    fail(error.message, 2, true);
    return;
  }

  try {
    const manifest = await loadManifest(args.manifest);
    const validation = validateManifest(manifest);
    if (!validation.ok) {
      const payload = { mode: mode(args), status: 'invalid', errors: validation.errors };
      await emit(
        args,
        payload,
        `Validation failed:\n${validation.errors.map((item) => `- ${item}`).join('\n')}`,
      );
      process.exitCode = 1;
      return;
    }

    const plan = buildPlan(manifest);
    if (args.apply) {
      await runApply(args, plan);
      return;
    }

    const summary = summarize(plan);
    if (args.dryRun) {
      const steps = buildDryRunSteps(plan);
      const payload = { mode: 'dry-run', status: 'planned', summary, steps };
      await emit(args, payload, `${formatSummary(summary)}\n${formatDryRunSteps(steps)}`);
      return;
    }

    const payload = { mode: 'validate', status: 'passed', summary };
    await emit(args, payload, `Validation passed.\n${formatSummary(summary)}`);
  } catch (error) {
    fail(error instanceof CliError ? error.message : 'Migration failed unexpectedly.', 1);
  }
}

await main();
