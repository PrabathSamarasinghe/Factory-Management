const METHODS = new Set(['GET', 'POST', 'PATCH', 'PUT', 'DELETE']);
const ENVIRONMENTS = new Set(['local', 'staging']);
const PLACEHOLDERS = new Set([
  'tripId',
  'supplierId',
  'pickupId',
  'deviceId',
  'personId',
  'locationId',
  'clientWeighingId',
  'clientPickupId',
  'clientEventId',
  'clientSyncId',
  'date',
  'since',
  'weighedAt',
  'sentAt',
  'capturedAt',
  'eventAt',
  'channel',
  'faceFrameBase64',
]);
const PLACEHOLDER_PATTERN = /\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g;
const HEADER_NAME_PATTERN = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const SENSITIVE_HEADER_PATTERN =
  /(authorization|proxy-authorization|cookie|set-cookie|api[-_]?key|token|secret|password|credential|session)/i;
const SENSITIVE_QUERY_PATTERN = /(token|secret|password|api[-_]?key|signature|sig)/i;
const SENSITIVE_BODY_KEY_PATTERN = /(token|secret|password|authorization|apikey|api[-_]?key)/i;
const REDACTED = '[REDACTED]';

export function validateScenario(scenario) {
  if (!isPlainObject(scenario)) {
    throw new TypeError('scenario must be a plain object.');
  }

  assertKeys(
    scenario,
    ['name', 'description', 'targetEnv', 'basePath', 'warmup', 'requests', 'thresholds'],
    ['name', 'description', 'targetEnv', 'basePath', 'warmup', 'requests', 'thresholds'],
    'scenario',
  );

  const value = structuredClone(scenario);
  value.name = requiredString(value.name, 'scenario.name', 120);
  value.description = requiredString(value.description, 'scenario.description', 500);
  if (!ENVIRONMENTS.has(value.targetEnv)) {
    throw new Error(
      `scenario.targetEnv must be one of ${[...ENVIRONMENTS].join(', ')}; received ${JSON.stringify(value.targetEnv)}.`,
    );
  }
  value.basePath = validateBasePath(value.basePath);
  value.warmup = validateWarmup(value.warmup);

  if (!Array.isArray(value.requests) || value.requests.length === 0 || value.requests.length > 50) {
    throw new Error('scenario.requests must be an array with 1 to 50 requests.');
  }
  const names = new Set();
  value.requests = value.requests.map((request, index) =>
    validateRequest(request, index, value.basePath, names),
  );
  value.thresholds = validateThresholds(value.thresholds);

  const serialized = JSON.stringify({
    path: value.requests.map((request) => request.path),
    body: value.requests.map((request) => request.body ?? null),
  });
  assertPlaceholders(serialized, 'scenario');

  return value;
}

export function pickRequest(requests, random = Math.random) {
  if (!Array.isArray(requests) || requests.length === 0) {
    throw new TypeError('requests must be a non-empty array.');
  }
  if (typeof random !== 'function') {
    throw new TypeError('random must be a function.');
  }

  let total = 0;
  for (const [index, request] of requests.entries()) {
    if (!isPlainObject(request) || !isPositiveFinite(request.weight)) {
      throw new TypeError(`requests[${index}].weight must be a positive finite number.`);
    }
    total += request.weight;
  }
  if (!isPositiveFinite(total)) {
    throw new Error('The total request weight must be a positive finite number.');
  }

  const value = random();
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value >= 1) {
    throw new RangeError('random must return a finite number in [0, 1).');
  }

  let remaining = value * total;
  for (const request of requests) {
    remaining -= request.weight;
    if (remaining < 0) {
      return request;
    }
  }
  return requests[requests.length - 1];
}

export function percentile(values, p) {
  if (!Array.isArray(values) || values.length === 0) {
    throw new TypeError('values must be a non-empty array.');
  }
  if (typeof p !== 'number' || !Number.isFinite(p) || p <= 0 || p > 1) {
    throw new RangeError('p must be a finite number in (0, 1].');
  }
  for (const [index, value] of values.entries()) {
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new TypeError(`values[${index}] must be a finite number.`);
    }
  }

  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.ceil(p * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(rank, sorted.length - 1))];
}

export function redactHeaders(headers) {
  const entries = headerEntries(headers);
  const result = {};
  for (const [name, value] of [...entries].sort((left, right) => left[0].localeCompare(right[0]))) {
    const key = name.toLowerCase();
    result[key] = isSensitiveHeader(key, value) ? REDACTED : value;
  }
  return result;
}

export function parseArgs(argv = process.argv.slice(2)) {
  if (!Array.isArray(argv)) {
    throw new TypeError('argv must be an array.');
  }

  const parsed = {
    scenario: null,
    baseUrl: null,
    dryRun: true,
    run: false,
    concurrency: null,
    durationSeconds: null,
    tokenEnv: null,
    json: false,
    out: null,
  };
  const seen = new Set();
  let dryRunExplicit = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (typeof token !== 'string' || !token.startsWith('--')) {
      throw new Error(`Unexpected argument ${JSON.stringify(token)}.`);
    }
    const equals = token.indexOf('=');
    const flag = equals === -1 ? token : token.slice(0, equals);
    const inline = equals === -1 ? undefined : token.slice(equals + 1);
    if (seen.has(flag)) {
      throw new Error(`${flag} was specified more than once.`);
    }
    seen.add(flag);

    switch (flag) {
      case '--scenario':
        parsed.scenario = readValue(
          flag,
          inline,
          argv,
          () => index,
          (next) => (index = next),
        );
        if (!parsed.scenario.trim()) {
          throw new Error('--scenario must not be empty.');
        }
        break;
      case '--base-url':
        parsed.baseUrl = normalizeBaseUrl(
          readValue(
            flag,
            inline,
            argv,
            () => index,
            (next) => (index = next),
          ),
        );
        break;
      case '--dry-run':
        assertNoInline(flag, inline);
        dryRunExplicit = true;
        parsed.dryRun = true;
        break;
      case '--run':
        assertNoInline(flag, inline);
        parsed.run = true;
        parsed.dryRun = false;
        break;
      case '--concurrency': {
        const raw = readValue(
          flag,
          inline,
          argv,
          () => index,
          (next) => (index = next),
        );
        if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 1000) {
          throw new Error('--concurrency must be an integer between 1 and 1000.');
        }
        parsed.concurrency = Number(raw);
        break;
      }
      case '--duration-seconds': {
        const raw = readValue(
          flag,
          inline,
          argv,
          () => index,
          (next) => (index = next),
        );
        if (!/^\d+$/.test(raw) || Number(raw) < 1 || Number(raw) > 86400) {
          throw new Error('--duration-seconds must be an integer between 1 and 86400.');
        }
        parsed.durationSeconds = Number(raw);
        break;
      }
      case '--token-env': {
        const raw = readValue(
          flag,
          inline,
          argv,
          () => index,
          (next) => (index = next),
        );
        if (!/^[A-Z][A-Z0-9_]*$/.test(raw)) {
          throw new Error('--token-env must be an uppercase environment variable name.');
        }
        parsed.tokenEnv = raw;
        break;
      }
      case '--json':
        assertNoInline(flag, inline);
        parsed.json = true;
        break;
      case '--out': {
        const raw = readValue(
          flag,
          inline,
          argv,
          () => index,
          (next) => (index = next),
        );
        if (!raw.trim()) {
          throw new Error('--out must not be empty.');
        }
        parsed.out = raw;
        break;
      }
      default:
        throw new Error(`Unknown flag ${flag}.`);
    }
  }

  if (!parsed.scenario) {
    throw new Error('--scenario is required.');
  }
  if (parsed.run && dryRunExplicit) {
    throw new Error('--run and --dry-run cannot be used together.');
  }
  if (parsed.out && !parsed.run) {
    throw new Error('--out requires --run.');
  }
  return parsed;
}

export function buildReport({
  scenario,
  samples = [],
  startedAt = null,
  finishedAt = null,
  config = {},
  placeholderSources = {},
  warmupRequests = 0,
}) {
  const validated = validateScenario(scenario);
  if (!Array.isArray(samples)) {
    throw new TypeError('samples must be an array.');
  }
  if (!isPlainObject(config)) {
    throw new TypeError('config must be a plain object.');
  }

  const methodByName = new Map(validated.requests.map((request) => [request.name, request.method]));
  const checkedSamples = samples.map((sample, index) =>
    validateSample(sample, index, methodByName),
  );
  const totalRequests = checkedSamples.length;
  const failedRequests = checkedSamples.filter((sample) => !sample.ok).length;
  const successfulRequests = totalRequests - failedRequests;
  const errorRatePct = totalRequests === 0 ? 100 : round((failedRequests / totalRequests) * 100, 3);
  const allDurations = checkedSamples
    .filter((sample) => sample.ok)
    .map((sample) => sample.durationMs);
  const readDurations = checkedSamples
    .filter((sample) => sample.ok && sample.method === 'GET')
    .map((sample) => sample.durationMs);
  const p95Basis = readDurations.length > 0 ? 'read' : 'all';
  const p95Durations = readDurations.length > 0 ? readDurations : allDurations;
  const p95Ms = p95Durations.length > 0 ? round(percentile(p95Durations, 0.95), 2) : null;
  const overallP95Ms = allDurations.length > 0 ? round(percentile(allDurations, 0.95), 2) : null;
  const statusCounts = {};
  for (const status of checkedSamples
    .map((sample) => sample.status)
    .filter((status) => status !== null)) {
    const key = String(status);
    statusCounts[key] = (statusCounts[key] ?? 0) + 1;
  }

  const byRequest = {};
  for (const request of validated.requests) {
    const ownSamples = checkedSamples.filter((sample) => sample.name === request.name);
    const ownSuccesses = ownSamples
      .filter((sample) => sample.ok)
      .map((sample) => sample.durationMs);
    byRequest[request.name] = {
      requests: ownSamples.length,
      successful: ownSuccesses.length,
      failed: ownSamples.length - ownSuccesses.length,
      p95Ms: ownSuccesses.length > 0 ? round(percentile(ownSuccesses, 0.95), 2) : null,
    };
  }

  const limit = validated.thresholds;
  const checks = {
    maxErrorRatePct: {
      limit: limit.maxErrorRatePct,
      actual: errorRatePct,
      passed: errorRatePct <= limit.maxErrorRatePct,
    },
    maxP95Ms: {
      limit: limit.maxP95Ms,
      actual: p95Ms,
      basis: p95Basis,
      passed: p95Ms !== null && p95Ms <= limit.maxP95Ms,
    },
    minRequests: {
      minimum: limit.minRequests,
      actual: totalRequests,
      passed: totalRequests >= limit.minRequests,
    },
  };
  const durationMs =
    startedAt && finishedAt ? Date.parse(finishedAt) - Date.parse(startedAt) : null;
  checks.durationSeconds = {
    configured: limit.durationSeconds,
    actual: durationMs === null ? null : round(durationMs / 1000, 2),
    passed: true,
  };
  checks.concurrency = { configured: limit.concurrency, passed: true };

  const failures = [];
  if (!checks.minRequests.passed) {
    failures.push(
      `minRequests: expected at least ${limit.minRequests}, observed ${totalRequests}.`,
    );
  }
  if (!checks.maxErrorRatePct.passed) {
    failures.push(
      `maxErrorRatePct: expected at most ${limit.maxErrorRatePct}%, observed ${errorRatePct}%.`,
    );
  }
  if (!checks.maxP95Ms.passed) {
    failures.push(
      `maxP95Ms: expected at most ${limit.maxP95Ms}ms for ${p95Basis} requests, observed ${p95Ms === null ? 'no samples' : `${p95Ms}ms`}.`,
    );
  }

  const totalWeight = validated.requests.reduce((sum, request) => sum + request.weight, 0);
  return {
    scenario: {
      name: validated.name,
      description: validated.description,
      targetEnv: validated.targetEnv,
      basePath: validated.basePath,
      warmup: validated.warmup,
    },
    config: {
      baseUrl: typeof config.baseUrl === 'string' ? config.baseUrl : null,
      durationSeconds: config.durationSeconds ?? limit.durationSeconds,
      concurrency: config.concurrency ?? limit.concurrency,
      tokenEnv: config.tokenEnv ?? null,
      tokenPresent: Boolean(config.tokenPresent),
      out: config.out ?? null,
      insecureOverride: Boolean(config.insecureOverride),
    },
    startedAt,
    finishedAt,
    durationMs: durationMs === null ? null : round(durationMs, 2),
    warmupRequests,
    totalRequests,
    successfulRequests,
    failedRequests,
    errorRatePct,
    p95Ms,
    p95Basis,
    overallP95Ms,
    statusCounts,
    byRequest,
    samples: checkedSamples,
    headers: redactHeaders(config.headers ?? {}),
    placeholderSources: { ...placeholderSources },
    thresholds: checks,
    requestMix: validated.requests.map((request) => ({
      name: request.name,
      method: request.method,
      path: request.path,
      weight: request.weight,
      expectedSharePct: round((request.weight / totalWeight) * 100, 2),
      expectedStatus: request.expectedStatus ?? null,
    })),
    failures,
    passed: failures.length === 0,
  };
}

export function formatSummary(report) {
  if (!isPlainObject(report) || !isPlainObject(report.scenario)) {
    throw new TypeError('report must be a buildReport result.');
  }

  const lines = [
    `Scenario: ${report.scenario.name} (${report.scenario.targetEnv})`,
    `Base URL: ${report.config.baseUrl ?? 'not specified'}`,
    `Window: ${report.config.durationSeconds}s @ ${report.config.concurrency} workers; warmup ${report.scenario.warmup.durationSeconds}s @ ${report.scenario.warmup.concurrency} workers`,
    `Requests: ${report.totalRequests} total, ${report.successfulRequests} successful, ${report.failedRequests} failed`,
    `Error rate: ${report.errorRatePct}% (limit ${report.thresholds.maxErrorRatePct.limit}%)`,
    `p95 (${report.p95Basis}): ${report.p95Ms === null ? 'no samples' : `${report.p95Ms}ms`} (limit ${report.thresholds.maxP95Ms.limit}ms)`,
    `Minimum requests: ${report.totalRequests} (limit ${report.thresholds.minRequests.minimum})`,
    `Auth: ${report.config.tokenEnv ? `${report.config.tokenEnv} ${report.config.tokenPresent ? 'present' : 'missing'}` : 'none'}`,
    `Result: ${report.passed ? 'PASS' : 'FAIL'}`,
  ];

  if (report.config.out) {
    lines.push(`Report: ${report.config.out}`);
  }
  lines.push('Request mix:');
  for (const request of report.requestMix) {
    lines.push(
      `- ${request.method} ${request.path} [${request.name}]: ${request.expectedSharePct}% of traffic`,
    );
  }
  if (report.failures.length > 0) {
    lines.push('Failures:');
    for (const failure of report.failures) {
      lines.push(`- ${failure}`);
    }
  }
  return lines.join('\n');
}

function assertKeys(value, allowed, required, path) {
  for (const key of required) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) {
      throw new Error(`${path}.${key} is required.`);
    }
  }
  for (const key of Object.keys(value)) {
    if (!allowed.includes(key)) {
      throw new Error(`${path}.${key} is not allowed; expected ${allowed.join(', ')}.`);
    }
  }
}

function requiredString(value, path, maxLength) {
  if (typeof value !== 'string' || value.trim().length === 0 || value.length > maxLength) {
    throw new Error(`${path} must be a non-empty string of at most ${maxLength} characters.`);
  }
  if (/[\r\n\t]/.test(value)) {
    throw new Error(`${path} must not contain control characters.`);
  }
  return value.trim();
}

function validateBasePath(value) {
  const path = requiredString(value, 'scenario.basePath', 200);
  if (
    path !== '/api/v1' &&
    (!path.startsWith('/api/v1/') || path.endsWith('/') || /\s|#|\?|\/\//.test(path))
  ) {
    throw new Error(
      'scenario.basePath must be an /api/v1/... path without a trailing slash, query, fragment or double slash.',
    );
  }
  return path;
}

function validateWarmup(value) {
  if (!isPlainObject(value)) {
    throw new TypeError('scenario.warmup must be a plain object.');
  }
  assertKeys(
    value,
    ['durationSeconds', 'concurrency'],
    ['durationSeconds', 'concurrency'],
    'scenario.warmup',
  );
  assertInteger(value.durationSeconds, 'scenario.warmup.durationSeconds', 0, 86400);
  assertInteger(value.concurrency, 'scenario.warmup.concurrency', 1, 1000);
  return {
    durationSeconds: value.durationSeconds,
    concurrency: value.concurrency,
  };
}

function validateRequest(value, index, basePath, names) {
  const path = `scenario.requests[${index}]`;
  if (!isPlainObject(value)) {
    throw new TypeError(`${path} must be a plain object.`);
  }
  assertKeys(
    value,
    ['name', 'method', 'path', 'weight', 'headers', 'body', 'expectedStatus'],
    ['name', 'method', 'path', 'weight'],
    path,
  );

  const name = requiredString(value.name, `${path}.name`, 80);
  if (names.has(name)) {
    throw new Error(
      `scenario.requests[${index}].name must be unique; ${JSON.stringify(name)} is duplicated.`,
    );
  }
  names.add(name);

  const method = requiredString(value.method, `${path}.method`, 10);
  if (!METHODS.has(method) || method !== method.toUpperCase()) {
    throw new Error(`${path}.method must be one of ${[...METHODS].join(', ')} in uppercase.`);
  }

  const requestPath = validateRequestPath(value.path, basePath, `${path}.path`);
  if (!isPositiveFinite(value.weight) || value.weight > 1000) {
    throw new Error(`${path}.weight must be a positive finite number no greater than 1000.`);
  }

  const headers =
    value.headers === undefined ? {} : validateHeaders(value.headers, `${path}.headers`);
  const body = value.body === undefined ? null : validateBody(value.body, `${path}.body`);
  if (value.expectedStatus !== undefined) {
    assertInteger(value.expectedStatus, `${path}.expectedStatus`, 200, 299);
  }

  const request = {
    name,
    method,
    path: requestPath,
    weight: value.weight,
  };
  if (Object.keys(headers).length > 0) {
    request.headers = headers;
  }
  if (body !== null) {
    request.body = body;
  }
  if (value.expectedStatus !== undefined) {
    request.expectedStatus = value.expectedStatus;
  }
  return request;
}

function validateRequestPath(value, basePath, path) {
  const requestPath = requiredString(value, path, 512);
  if (!requestPath.startsWith(`${basePath}/`)) {
    throw new Error(`${path} must start with ${basePath}/.`);
  }
  if (
    requestPath.endsWith('/') ||
    requestPath.includes('#') ||
    requestPath.includes('://') ||
    /\s/.test(requestPath)
  ) {
    throw new Error(
      `${path} must be a clean gateway path without a trailing slash, fragment or whitespace.`,
    );
  }

  const urlPath = requestPath.replace(PLACEHOLDER_PATTERN, 'placeholder');
  let parsed;
  try {
    parsed = new URL(urlPath, 'http://load.invalid');
  } catch {
    throw new Error(`${path} is not a valid URL path.`);
  }
  if (parsed.pathname !== urlPath.split('?')[0]) {
    throw new Error(`${path} is not a valid URL path.`);
  }
  for (const [key] of parsed.searchParams) {
    if (SENSITIVE_QUERY_PATTERN.test(key)) {
      throw new Error(
        `${path} must not include a sensitive query parameter such as ${JSON.stringify(key)}.`,
      );
    }
  }
  assertPlaceholders(requestPath, path);
  return requestPath;
}

function validateHeaders(value, path) {
  if (!isPlainObject(value)) {
    throw new TypeError(`${path} must be a plain object.`);
  }
  const headers = {};
  for (const [name, headerValue] of Object.entries(value)) {
    if (!HEADER_NAME_PATTERN.test(name)) {
      throw new Error(`${path}.${name} is not a valid HTTP header name.`);
    }
    if (SENSITIVE_HEADER_PATTERN.test(name)) {
      throw new Error(`${path}.${name} must not be set in a scenario; use --token-env instead.`);
    }
    if (typeof headerValue !== 'string' || headerValue.length > 512 || /[\r\n]/.test(headerValue)) {
      throw new Error(
        `${path}.${name} must be a string of at most 512 characters without line breaks.`,
      );
    }
    headers[name] = headerValue;
  }
  return headers;
}

function validateBody(value, path) {
  if (!isPlainObject(value)) {
    throw new TypeError(`${path} must be a plain object.`);
  }
  assertJsonValue(value, path);
  return value;
}

function assertJsonValue(value, path) {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') {
    return;
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new Error(`${path} must contain only finite numbers.`);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonValue(item, `${path}[${index}]`));
    return;
  }
  if (isPlainObject(value)) {
    for (const [key, item] of Object.entries(value)) {
      if (SENSITIVE_BODY_KEY_PATTERN.test(key)) {
        throw new Error(`${path}.${key} must not appear in a scenario body template.`);
      }
      assertJsonValue(item, `${path}.${key}`);
    }
    return;
  }
  throw new Error(`${path} must be JSON-serializable.`);
}

function validateThresholds(value) {
  if (!isPlainObject(value)) {
    throw new TypeError('scenario.thresholds must be a plain object.');
  }
  assertKeys(
    value,
    ['durationSeconds', 'concurrency', 'maxErrorRatePct', 'maxP95Ms', 'minRequests'],
    ['durationSeconds', 'concurrency', 'maxErrorRatePct', 'maxP95Ms', 'minRequests'],
    'scenario.thresholds',
  );
  assertInteger(value.durationSeconds, 'scenario.thresholds.durationSeconds', 1, 86400);
  assertInteger(value.concurrency, 'scenario.thresholds.concurrency', 1, 1000);
  assertNumber(value.maxErrorRatePct, 'scenario.thresholds.maxErrorRatePct', 0, 100);
  assertNumber(value.maxP95Ms, 'scenario.thresholds.maxP95Ms', 0, 600000);
  assertInteger(value.minRequests, 'scenario.thresholds.minRequests', 1, 10000000);
  return {
    durationSeconds: value.durationSeconds,
    concurrency: value.concurrency,
    maxErrorRatePct: value.maxErrorRatePct,
    maxP95Ms: value.maxP95Ms,
    minRequests: value.minRequests,
  };
}

function validateSample(sample, index, methodByName) {
  const path = `samples[${index}]`;
  if (!isPlainObject(sample)) {
    throw new TypeError(`${path} must be a plain object.`);
  }
  if (typeof sample.name !== 'string' || !methodByName.has(sample.name)) {
    throw new Error(`${path}.name must match a scenario request name.`);
  }
  if (
    sample.status !== null &&
    (typeof sample.status !== 'number' ||
      !Number.isInteger(sample.status) ||
      sample.status < 100 ||
      sample.status > 599)
  ) {
    throw new Error(`${path}.status must be an HTTP status code or null.`);
  }
  if (
    typeof sample.durationMs !== 'number' ||
    !Number.isFinite(sample.durationMs) ||
    sample.durationMs < 0
  ) {
    throw new Error(`${path}.durationMs must be a non-negative finite number.`);
  }
  if (typeof sample.ok !== 'boolean') {
    throw new Error(`${path}.ok must be a boolean.`);
  }
  return {
    name: sample.name,
    method: methodByName.get(sample.name),
    status: sample.status,
    durationMs: sample.durationMs,
    ok: sample.ok,
    error:
      sample.error === undefined || sample.error === null
        ? null
        : String(sample.error).slice(0, 300),
  };
}

function assertPlaceholders(text, path) {
  for (const match of text.matchAll(PLACEHOLDER_PATTERN)) {
    if (!PLACEHOLDERS.has(match[1])) {
      throw new Error(`${path} uses unknown placeholder ${JSON.stringify(match[0])}.`);
    }
  }
}

function assertInteger(value, path, minimum, maximum) {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${path} must be an integer between ${minimum} and ${maximum}.`);
  }
}

function assertNumber(value, path, minimum, maximum) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    throw new Error(`${path} must be a number between ${minimum} and ${maximum}.`);
  }
}

function isPlainObject(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isPositiveFinite(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function round(value, digits) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function headerEntries(headers) {
  if (headers === undefined || headers === null) {
    return [];
  }
  if (typeof Headers !== 'undefined' && headers instanceof Headers) {
    return [...headers.entries()].map(([name, value]) => [String(name), String(value)]);
  }
  if (Array.isArray(headers)) {
    return headers.map((entry, index) => {
      if (
        !Array.isArray(entry) ||
        entry.length !== 2 ||
        typeof entry[0] !== 'string' ||
        typeof entry[1] !== 'string'
      ) {
        throw new TypeError(`headers[${index}] must be a [name, value] pair of strings.`);
      }
      return entry;
    });
  }
  if (isPlainObject(headers)) {
    return Object.entries(headers).map(([name, value]) => {
      if (typeof value !== 'string') {
        throw new TypeError(`headers.${name} must be a string.`);
      }
      return [name, value];
    });
  }
  throw new TypeError('headers must be an object, array of pairs, Headers instance or null.');
}

function isSensitiveHeader(name, value) {
  return (
    SENSITIVE_HEADER_PATTERN.test(name) ||
    /^Bearer\s/i.test(value) ||
    /^eyJ[A-Za-z0-9_-]+\./.test(value)
  );
}

function readValue(flag, inline, argv, getIndex, setIndex) {
  if (inline !== undefined) {
    return inline;
  }
  const next = getIndex() + 1;
  if (next >= argv.length || String(argv[next]).startsWith('--')) {
    throw new Error(`${flag} requires a value.`);
  }
  setIndex(next);
  return String(argv[next]);
}

function assertNoInline(flag, inline) {
  if (inline !== undefined) {
    throw new Error(`${flag} does not accept a value.`);
  }
}

function normalizeBaseUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('--base-url must be a valid absolute URL.');
  }
  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error('--base-url must use http or https.');
  }
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('--base-url must be an origin without credentials, path, query or fragment.');
  }
  return `${url.origin}/`;
}
