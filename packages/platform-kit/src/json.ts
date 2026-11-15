/**
 * Deterministic JSON serialization: object keys sorted, `undefined` omitted,
 * Date -> ISO string, Buffer -> base64. Used for hashing only.
 */
export function canonicalStringify(value: unknown): string {
  return JSON.stringify(sortValue(value, new WeakSet<object>()));
}

function sortValue(value: unknown, seen: WeakSet<object>): unknown {
  if (value === null || typeof value !== 'object') {
    return value;
  }
  if (seen.has(value)) {
    throw new TypeError('Cannot canonicalize a circular structure.');
  }
  seen.add(value);

  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Buffer.isBuffer(value)) {
    return value.toString('base64');
  }
  if (Array.isArray(value)) {
    return value.map((item) => sortValue(item, seen));
  }

  const source = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(source).sort()) {
    const item = source[key];
    if (item === undefined) {
      continue;
    }
    out[key] = sortValue(item, seen);
  }
  return out;
}
