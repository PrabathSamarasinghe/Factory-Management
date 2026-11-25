import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildReport,
  parseArgs,
  percentile,
  pickRequest,
  redactHeaders,
  validateScenario,
} from './lib.mjs';

function makeScenario() {
  return {
    name: 'Fixture load test',
    description: 'A small scenario used by unit tests.',
    targetEnv: 'staging',
    basePath: '/api/v1',
    warmup: {
      durationSeconds: 1,
      concurrency: 2,
    },
    requests: [
      {
        name: 'read',
        method: 'GET',
        path: '/api/v1/collection/trips/{{tripId}}/readiness',
        weight: 3,
        headers: {
          Accept: 'application/json',
        },
        expectedStatus: 200,
      },
      {
        name: 'write',
        method: 'POST',
        path: '/api/v1/collection/weighings',
        weight: 1,
        headers: {
          'Content-Type': 'application/json',
        },
        body: {
          clientWeighingId: '{{clientWeighingId}}',
          tripId: '{{tripId}}',
        },
      },
    ],
    thresholds: {
      durationSeconds: 10,
      concurrency: 5,
      maxErrorRatePct: 0.5,
      maxP95Ms: 300,
      minRequests: 200,
    },
  };
}

test('validateScenario accepts a complete scenario and returns a clone', () => {
  const scenario = makeScenario();
  const validated = validateScenario(scenario);
  assert.notStrictEqual(validated, scenario);
  assert.deepEqual(validated, scenario);
  assert.equal(validated.requests.length, 2);
});

test('validateScenario rejects malformed scenarios with useful errors', () => {
  const scenario = makeScenario();

  assert.throws(() => validateScenario(null), /plain object/);
  assert.throws(() => validateScenario({ ...scenario, extra: true }), /extra is not allowed/);
  assert.throws(() => validateScenario({ ...scenario, requests: [] }), /1 to 50 requests/);
  assert.throws(
    () => validateScenario({ ...scenario, basePath: '/api/v2' }),
    /must be an \/api\/v1\//,
  );
  assert.throws(
    () =>
      validateScenario({
        ...scenario,
        requests: [{ ...scenario.requests[0], method: 'get' }],
      }),
    /uppercase/,
  );
  assert.throws(
    () => validateScenario({ ...scenario, requests: [{ ...scenario.requests[0], weight: 0 }] }),
    /positive finite/,
  );
  assert.throws(
    () =>
      validateScenario({
        ...scenario,
        requests: [{ ...scenario.requests[0], headers: { Authorization: 'Bearer secret' } }],
      }),
    /use --token-env/,
  );
  assert.throws(
    () =>
      validateScenario({
        ...scenario,
        requests: [{ ...scenario.requests[0], path: '/api/v1/collection/weighings?token=x' }],
      }),
    /sensitive query parameter/,
  );
  assert.throws(
    () => validateScenario({ ...scenario, thresholds: { ...scenario.thresholds, maxP95Ms: -1 } }),
    /between 0 and 600000/,
  );
});

test('pickRequest honours weight boundaries deterministically', () => {
  const requests = [
    { name: 'first', weight: 1 },
    { name: 'second', weight: 3 },
  ];
  assert.equal(pickRequest(requests, () => 0).name, 'first');
  assert.equal(pickRequest(requests, () => 0.249999).name, 'first');
  assert.equal(pickRequest(requests, () => 0.25).name, 'second');
  assert.equal(pickRequest(requests, () => 0.999999).name, 'second');
  assert.throws(() => pickRequest(requests, () => 1), /\[0, 1\)/);
  assert.throws(() => pickRequest([], () => 0.5), /non-empty array/);
});

test('percentile uses deterministic nearest-rank selection', () => {
  assert.equal(percentile([5, 1, 4, 2, 3], 0.5), 3);
  assert.equal(percentile([5, 1, 4, 2, 3], 0.2), 1);
  assert.equal(percentile([5, 1, 4, 2, 3], 0.95), 5);
  assert.equal(percentile([10, 20, 30, 40], 0.75), 30);
  assert.throws(() => percentile([], 0.95), /non-empty array/);
  assert.throws(() => percentile([1], 0), /\(0, 1\]/);
});

test('buildReport evaluates read latency, errors and request volume thresholds', () => {
  const scenario = makeScenario();
  const baseline = Array.from({ length: 200 }, () => ({
    name: 'read',
    status: 200,
    durationMs: 100,
    ok: true,
    error: null,
  }));
  const failing = buildReport({
    scenario,
    samples: [
      ...baseline,
      { name: 'write', status: 500, durationMs: 600, ok: false, error: 'upstream failed' },
      { name: 'write', status: 500, durationMs: 700, ok: false, error: 'upstream failed' },
    ],
    startedAt: '2026-11-25T00:00:00.000Z',
    finishedAt: '2026-11-25T00:00:10.000Z',
    config: { baseUrl: 'https://staging.example.test/' },
  });

  assert.equal(failing.totalRequests, 202);
  assert.equal(failing.failedRequests, 2);
  assert.equal(failing.p95Basis, 'read');
  assert.equal(failing.p95Ms, 100);
  assert.equal(failing.thresholds.maxP95Ms.passed, true);
  assert.equal(failing.thresholds.maxErrorRatePct.passed, false);
  assert.equal(failing.thresholds.minRequests.passed, true);
  assert.equal(failing.passed, false);
  assert.match(failing.failures.join('\n'), /maxErrorRatePct/);

  const passing = buildReport({
    scenario,
    samples: baseline,
    startedAt: '2026-11-25T00:00:00.000Z',
    finishedAt: '2026-11-25T00:00:10.000Z',
    config: { baseUrl: 'https://staging.example.test/', headers: { Accept: 'application/json' } },
  });
  assert.equal(passing.passed, true);
  assert.deepEqual(passing.headers, { accept: 'application/json' });
  assert.match(JSON.stringify(passing), /"requestMix"/);
});

test('redactHeaders masks tokens without altering safe headers', () => {
  const plain = redactHeaders({
    Authorization: 'Bearer super-secret-token',
    'X-Api-Key': 'key-value',
    'X-Trace-Id': 'trace-1',
    Cookie: 'session=secret',
  });
  assert.deepEqual(plain, {
    authorization: '[REDACTED]',
    cookie: '[REDACTED]',
    'x-api-key': '[REDACTED]',
    'x-trace-id': 'trace-1',
  });
  assert.equal(JSON.stringify(plain).includes('super-secret-token'), false);

  const fromHeaders = redactHeaders(
    new Headers({ authorization: 'Bearer another-secret', 'X-Request-Id': 'request-1' }),
  );
  assert.equal(fromHeaders.authorization, '[REDACTED]');
  assert.equal(fromHeaders['x-request-id'], 'request-1');
});

test('parseArgs applies dry-run defaults and accepts explicit flags', () => {
  assert.deepEqual(parseArgs(['--scenario', 'scenario.json']), {
    scenario: 'scenario.json',
    baseUrl: null,
    dryRun: true,
    run: false,
    concurrency: null,
    durationSeconds: null,
    tokenEnv: null,
    json: false,
    out: null,
  });

  const parsed = parseArgs([
    '--scenario=scenario.json',
    '--run',
    '--base-url=https://staging.example.test',
    '--concurrency=25',
    '--duration-seconds=120',
    '--token-env=LOAD_TEST_TOKEN',
    '--json',
    '--out=report.json',
  ]);
  assert.equal(parsed.dryRun, false);
  assert.equal(parsed.run, true);
  assert.equal(parsed.baseUrl, 'https://staging.example.test/');
  assert.equal(parsed.concurrency, 25);
  assert.equal(parsed.durationSeconds, 120);
  assert.equal(parsed.tokenEnv, 'LOAD_TEST_TOKEN');
  assert.equal(parsed.json, true);
  assert.equal(parsed.out, 'report.json');
});

test('parseArgs rejects invalid combinations and values', () => {
  assert.throws(() => parseArgs([]), /--scenario is required/);
  assert.throws(() => parseArgs(['--scenario', 'a', '--unknown']), /Unknown flag/);
  assert.throws(() => parseArgs(['--scenario', 'a', '--scenario', 'b']), /more than once/);
  assert.throws(() => parseArgs(['--scenario']), /requires a value/);
  assert.throws(
    () => parseArgs(['--scenario', 'a', '--run', '--dry-run']),
    /cannot be used together/,
  );
  assert.throws(() => parseArgs(['--scenario', 'a', '--out', 'r.json']), /requires --run/);
  assert.throws(
    () => parseArgs(['--scenario', 'a', '--base-url', 'http://user:pass@example.test']),
    /without credentials/,
  );
  assert.throws(
    () => parseArgs(['--scenario', 'a', '--token-env', 'lower-case']),
    /uppercase environment variable name/,
  );
});
