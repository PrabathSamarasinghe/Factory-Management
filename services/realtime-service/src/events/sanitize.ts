const SENSITIVE_KEY_PATTERN =
  /(phone|mobile|msisdn|body|messagebody|text|recipient|address|email|account[_-]?number|customer|nic|password|secret|token|amount|balance|name)/i;

export function sanitizePayload(value: unknown, depth = 0): Record<string, unknown> {
  if (depth > 8 || value === null || typeof value !== 'object') return {};
  if (Array.isArray(value)) {
    return { items: value.map((item) => sanitizePayload(item, depth + 1)) };
  }

  const result: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (SENSITIVE_KEY_PATTERN.test(key)) continue;
    if (item === null || typeof item !== 'object') {
      result[key] = item;
      continue;
    }
    result[key] = sanitizePayload(item, depth + 1);
  }
  return result;
}
