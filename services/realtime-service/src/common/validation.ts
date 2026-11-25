import { ValidationError } from '@galatura/platform-kit';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`${label} is required.`);
  }
  return value.trim();
}

export function optionalString(value: unknown, label = 'value'): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') throw new ValidationError(`${label} must be a string.`);
  return value.trim() || undefined;
}

export function isUuidText(value: unknown): value is string {
  return typeof value === 'string' && UUID_PATTERN.test(value.toLowerCase());
}

export function uuid(value: unknown, label: string): string {
  const text = requiredString(value, label).toLowerCase();
  if (!UUID_PATTERN.test(text)) {
    throw new ValidationError(`${label} must be a UUID.`);
  }
  return text;
}

export function dateTime(value: unknown, label: string): Date {
  const text = requiredString(value, label);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${label} must be an ISO timestamp.`);
  }
  return parsed;
}

export function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new ValidationError(`${label} must be a boolean.`);
  return value;
}

export function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new ValidationError(`${label} must be an array of non-empty strings.`);
  }
  return (value as string[]).map((item) => item.trim());
}

export function oneOf(value: unknown, values: readonly string[], label: string): string {
  const text = requiredString(value, label);
  if (!values.includes(text)) {
    throw new ValidationError(`${label} must be one of ${values.join(', ')}.`);
  }
  return text;
}
