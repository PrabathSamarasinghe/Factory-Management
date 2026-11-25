#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildReport,
  formatSummary,
  parseArgs,
  pickRequest,
  redactHeaders,
  validateScenario,
} from './lib.mjs';

const REQUEST_TIMEOUT_MS = 10_000;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const PLACEHOLDER_PATTERN = /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g;

await main();

async function main() {
  try {
    const args = parseArgs(process.argv.slice(2));
    const scenario = validateScenario(
      JSON.parse(readFileSync(resolve(process.cwd(), args.scenario), 'utf8')),
    );
    const durationSeconds = args.durationSeconds ?? scenario.thresholds.durationSeconds;
    const concurrency = args.concurrency ?? scenario.thresholds.concurrency;
    const requestHeaders = collectHeaders(scenario);
    const placeholderSources = collectPlaceholderSources(scenario);

    if (args.dryRun) {
      const plan = buildDryRunPlan({
        scenario,
        args,
        durationSeconds,
        concurrency,
        requestHeaders,
        placeholderSources,
      });
      console.log(args.json ? JSON.stringify(plan, null, 2) : formatDryRunPlan(plan));
      return;
    }

    assertRunSafety(args, scenario);
    const token = resolveToken(args.tokenEnv);
    if (token !== null) {
      requestHeaders.Authorization = `Bearer ${token}`;
    }
    const context = createPlaceholderContext();
    assertPlaceholdersResolvable(placeholderSources, context);

    const outPath = args.out === null ? null : resolve(process.cwd(), args.out);
    const insecureOverride = process.env.LOAD_TEST_ALLOW_INSECURE === '1';
    const warmup = await runPhase({
      durationSeconds: scenario.warmup.durationSeconds,
      concurrency: scenario.warmup.concurrency,
      scenario,
      baseUrl: args.baseUrl,
      headers: requestHeaders,
      context,
      collect: false,
    });
    const startedAt = new Date().toISOString();
    const measured = await runPhase({
      durationSeconds,
      concurrency,
      scenario,
      baseUrl: args.baseUrl,
      headers: requestHeaders,
      context,
      collect: true,
    });
    const finishedAt = new Date().toISOString();

    const report = buildReport({
      scenario,
      samples: measured.samples,
      startedAt,
      finishedAt,
      warmupRequests: warmup.requests,
      placeholderSources,
      config: {
        baseUrl: args.baseUrl,
        durationSeconds,
        concurrency,
        tokenEnv: args.tokenEnv,
        tokenPresent: token !== null,
        out: outPath,
        insecureOverride,
        headers: requestHeaders,
      },
    });
    const serialized = JSON.stringify(report, null, 2);
    if (outPath !== null) {
      writeFileSync(outPath, `${serialized}\n`, 'utf8');
    }
    console.log(args.json ? serialized : formatSummary(report));
    if (!report.passed) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(safeError(error));
    process.exitCode = 1;
  }
}

function buildDryRunPlan({
  scenario,
  args,
  durationSeconds,
  concurrency,
  requestHeaders,
  placeholderSources,
}) {
  const totalWeight = scenario.requests.reduce((sum, request) => sum + request.weight, 0);
  return {
    mode: 'dry-run',
    scenario: {
      name: scenario.name,
      description: scenario.description,
      targetEnv: scenario.targetEnv,
      basePath: scenario.basePath,
    },
    baseUrl: args.baseUrl,
    warmup: scenario.warmup,
    measured: {
      durationSeconds,
      concurrency,
      minRequests: scenario.thresholds.minRequests,
    },
    thresholds: scenario.thresholds,
    auth: {
      tokenEnv: args.tokenEnv,
      resolved: false,
    },
    headers: redactHeaders(requestHeaders),
    placeholderSources,
    requestMix: scenario.requests.map((request) => ({
      name: request.name,
      method: request.method,
      path: request.path,
      weight: request.weight,
      expectedSharePct: Math.round((request.weight / totalWeight) * 10000) / 100,
      expectedStatus: request.expectedStatus ?? null,
      hasBodyTemplate: request.body !== undefined,
      headers: redactHeaders(request.headers ?? {}),
    })),
  };
}

function formatDryRunPlan(plan) {
  const lines = [
    `Dry run: ${plan.scenario.name} (${plan.scenario.targetEnv})`,
    `Base URL: ${plan.baseUrl ?? 'not specified'}`,
    `Warmup: ${plan.warmup.durationSeconds}s @ ${plan.warmup.concurrency} workers`,
    `Measured: ${plan.measured.durationSeconds}s @ ${plan.measured.concurrency} workers`,
    `Minimum requests: ${plan.measured.minRequests}`,
    `Auth: ${plan.auth.tokenEnv ?? 'none'} (not resolved in dry run)`,
    `Gateway base path: ${plan.scenario.basePath}`,
    'Planned workload:',
  ];
  for (const request of plan.requestMix) {
    lines.push(
      `- ${request.method} ${request.path} [${request.name}]: weight ${request.weight}, ${request.expectedSharePct}% of traffic${request.hasBodyTemplate ? ', body template configured' : ''}`,
    );
  }
  return lines.join('\n');
}

function assertRunSafety(args, scenario) {
  if (args.baseUrl === null) {
    throw new Error('--base-url is required with --run.');
  }
  if (scenario.targetEnv !== 'staging') {
    throw new Error(
      `--run requires scenario.targetEnv to be "staging"; found "${scenario.targetEnv}".`,
    );
  }
  const url = new URL(args.baseUrl);
  const isLocal = LOCAL_HOSTS.has(url.hostname.toLowerCase());
  if (url.protocol === 'http:' && !isLocal && process.env.LOAD_TEST_ALLOW_INSECURE !== '1') {
    throw new Error(
      'Refusing non-local HTTP traffic. Use HTTPS, a localhost URL, or set LOAD_TEST_ALLOW_INSECURE=1 for an approved staging tunnel.',
    );
  }
}

function resolveToken(tokenEnv) {
  if (tokenEnv === null) {
    return null;
  }
  const value = process.env[tokenEnv];
  if (typeof value !== 'string' || value.length === 0 || /[\r\n]/.test(value)) {
    throw new Error(`Token source ${tokenEnv} is missing or invalid.`);
  }
  return value;
}

function collectHeaders(scenario) {
  const headers = {};
  for (const request of scenario.requests) {
    for (const [name, value] of Object.entries(request.headers ?? {})) {
      headers[name] = value;
    }
  }
  return headers;
}

function createPlaceholderContext() {
  const stable = new Map([
    ['tripId', randomUUID()],
    ['supplierId', randomUUID()],
    ['pickupId', randomUUID()],
    ['deviceId', randomUUID()],
    ['personId', randomUUID()],
    ['locationId', randomUUID()],
    ['channel', 'weighing.live'],
    ['date', new Date().toISOString().slice(0, 10)],
  ]);
  const perRequest = new Set([
    'clientWeighingId',
    'clientPickupId',
    'clientEventId',
    'clientSyncId',
  ]);
  const timestamp = new Set(['weighedAt', 'sentAt', 'capturedAt', 'eventAt']);

  return {
    resolve(name) {
      const envName = envNameFor(name);
      const fromEnv = process.env[envName];
      if (typeof fromEnv === 'string' && fromEnv.length > 0) {
        return fromEnv;
      }
      if (stable.has(name)) {
        return stable.get(name);
      }
      if (perRequest.has(name)) {
        return randomUUID();
      }
      if (name === 'since') {
        return new Date(Date.now() - 3_600_000).toISOString();
      }
      if (timestamp.has(name)) {
        return new Date().toISOString();
      }
      throw new Error(`Placeholder {{${name}}} requires ${envName}.`);
    },
  };
}

function collectPlaceholderSources(scenario) {
  const sources = {};
  const serialized = JSON.stringify(scenario);
  for (const match of serialized.matchAll(PLACEHOLDER_PATTERN)) {
    sources[match[1]] = process.env[envNameFor(match[1])] ? 'env' : 'generated';
  }
  return sources;
}

function assertPlaceholdersResolvable(sources, context) {
  for (const name of Object.keys(sources)) {
    context.resolve(name);
  }
}

function envNameFor(name) {
  const parts = name
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/([A-Z])([A-Z][a-z])/g, '$1_$2')
    .toUpperCase();
  return `LOAD_TEST_${parts}`;
}

function interpolate(value, resolve) {
  if (typeof value === 'string') {
    return value.replace(PLACEHOLDER_PATTERN, (_match, name) => resolve(name));
  }
  if (Array.isArray(value)) {
    return value.map((item) => interpolate(item, resolve));
  }
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(
      Object.entries(value).map(([key, item]) => [key, interpolate(item, resolve)]),
    );
  }
  return value;
}

async function runPhase({
  durationSeconds,
  concurrency,
  scenario,
  baseUrl,
  headers,
  context,
  collect,
}) {
  const deadlineMs = performance.now() + durationSeconds * 1000;
  let requests = 0;
  const samples = [];

  await Promise.all(
    Array.from({ length: concurrency }, async () => {
      while (performance.now() < deadlineMs) {
        const request = pickRequest(scenario.requests, Math.random);
        const sequence = (requests += 1);
        const path = interpolate(request.path, context.resolve);
        const body =
          request.body === undefined
            ? undefined
            : JSON.stringify(interpolate(request.body, context.resolve));
        const requestHeaders = { ...headers, ...(request.headers ?? {}) };
        let url;
        try {
          url = new URL(path, baseUrl);
        } catch (error) {
          if (collect) {
            samples.push({
              name: request.name,
              status: null,
              durationMs: 0,
              ok: false,
              error: safeError(error),
            });
          }
          continue;
        }

        const startedMs = performance.now();
        try {
          const response = await fetch(url, {
            method: request.method,
            headers: requestHeaders,
            body,
            signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
          });
          await discardBody(response);
          const durationMs = performance.now() - startedMs;
          if (collect) {
            samples.push({
              name: request.name,
              status: response.status,
              durationMs,
              ok: isExpectedStatus(response.status, request.expectedStatus),
              error: null,
            });
          }
        } catch (error) {
          const durationMs = performance.now() - startedMs;
          if (collect) {
            samples.push({
              name: request.name,
              status: null,
              durationMs,
              ok: false,
              error: safeError(error),
            });
          }
        }
      }
    }),
  );

  return { requests, samples };
}

function isExpectedStatus(status, expectedStatus) {
  return expectedStatus === undefined ? status >= 200 && status < 400 : status === expectedStatus;
}

async function discardBody(response) {
  try {
    if (response.body) {
      await response.body.cancel();
    }
  } catch (error) {
    void error;
  }
}

function safeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]')
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED]')
    .replace(/([?&][^=&]+=)[^&\s]+/g, '$1[REDACTED]')
    .slice(0, 300);
}
