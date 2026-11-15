export const REDACTED = '[REDACTED]';

const SENSITIVE_KEY_PATTERN =
  /(password|passwd|secret|token|authorization|cookie|api[_-]?key|private[_-]?key|master[_-]?key|totp|national[_-]?id|^nic$|nic[_-]?number|account[_-]?number|bank[_-]?account|face[_-]?template|template[_-]?enc|embedding|cvv|card[_-]?number|^pan$|idempotency[_-]?key|phone|email)/i;

const SENSITIVE_VALUE_PATTERNS: RegExp[] = [
  /^Bearer\s+\S+$/i,
  /^eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/, // JWT
];

export function isSensitiveKey(key: string): boolean {
  return SENSITIVE_KEY_PATTERN.test(key);
}

export function isSensitiveValue(value: string): boolean {
  return SENSITIVE_VALUE_PATTERNS.some((pattern) => pattern.test(value));
}

export interface RedactionOptions {
  /** Additional keys (case-insensitive) to redact. */
  extraKeys?: readonly string[];
  /** Maximum object depth to walk. Default 6. */
  maxDepth?: number;
}

/** Recursively redact sensitive keys/values without mutating the input. */
export function redactValue(value: unknown, options: RedactionOptions = {}): unknown {
  return walk(value, options, new WeakSet<object>(), 0);
}

export function redactObject(
  input: Record<string, unknown>,
  options: RedactionOptions = {},
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    if (
      isSensitiveKey(key) ||
      options.extraKeys?.some((k) => k.toLowerCase() === key.toLowerCase())
    ) {
      result[key] = REDACTED;
      continue;
    }
    result[key] = redactValue(value, options);
  }
  return result;
}

function walk(
  value: unknown,
  options: RedactionOptions,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  const maxDepth = options.maxDepth ?? 6;

  if (typeof value === 'string') {
    return isSensitiveValue(value) ? REDACTED : value;
  }
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (depth >= maxDepth) {
    return '[Truncated]';
  }
  if (seen.has(value)) {
    return '[Circular]';
  }
  seen.add(value);

  if (value instanceof Date) {
    return value.toISOString();
  }
  if (value instanceof Error) {
    return {
      name: value.name,
      message: isSensitiveValue(value.message) ? REDACTED : value.message,
      code: 'code' in value ? (value as { code?: unknown }).code : undefined,
    };
  }
  if (Buffer.isBuffer(value)) {
    return `[Buffer ${value.length} bytes]`;
  }
  if (Array.isArray(value)) {
    return value.map((item) => walk(item, options, seen, depth + 1));
  }

  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(source)) {
    if (
      isSensitiveKey(key) ||
      options.extraKeys?.some((k) => k.toLowerCase() === key.toLowerCase())
    ) {
      out[key] = REDACTED;
      continue;
    }
    out[key] = walk(item, options, seen, depth + 1);
  }
  return out;
}
