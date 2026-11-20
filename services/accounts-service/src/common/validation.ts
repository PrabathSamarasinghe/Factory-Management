import { ValidationError } from '@galatura/platform-kit';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MONEY_PATTERN = /^\d+(\.\d{1,2})?$/;
const QUANTITY_PATTERN = /^\d+(\.\d{1,3})?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

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

export function uuid(value: unknown, label: string): string {
  const text = requiredString(value, label).toLowerCase();
  if (!UUID_PATTERN.test(text)) {
    throw new ValidationError(`${label} must be a UUID.`);
  }
  return text;
}

export function optionalUuid(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return uuid(value, label);
}

export function money(value: unknown, label: string): string {
  if (typeof value !== 'string' || !MONEY_PATTERN.test(value.trim())) {
    throw new ValidationError(`${label} must be a decimal string with at most 2 places.`);
  }
  return value.trim();
}

export function optionalMoney(value: unknown, label: string): string | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return money(value, label);
}

export function quantity(value: unknown, label: string): string {
  if (typeof value !== 'string' || !QUANTITY_PATTERN.test(value.trim())) {
    throw new ValidationError(`${label} must be a decimal string with at most 3 places.`);
  }
  return value.trim();
}

export function positiveInt(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(`${label} must be a positive whole number.`);
  }
  return parsed;
}

export function optionalPositiveInt(value: unknown, label: string): number | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return positiveInt(value, label);
}

export function booleanValue(value: unknown, label: string): boolean {
  if (typeof value !== 'boolean') throw new ValidationError(`${label} must be a boolean.`);
  return value;
}

export function dateOnly(value: unknown, label: string): Date {
  const text = requiredString(value, label);
  if (!DATE_PATTERN.test(text) || Number.isNaN(Date.parse(`${text}T00:00:00.000Z`))) {
    throw new ValidationError(`${label} must be YYYY-MM-DD.`);
  }
  return new Date(`${text}T00:00:00.000Z`);
}

export function optionalDateOnly(value: unknown, label: string): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return dateOnly(value, label);
}

export function dateTime(value: unknown, label: string): Date {
  const text = requiredString(value, label);
  const parsed = new Date(text);
  if (Number.isNaN(parsed.getTime())) {
    throw new ValidationError(`${label} must be an ISO timestamp.`);
  }
  return parsed;
}

export function oneOf(value: unknown, values: readonly string[], label: string): string {
  const text = requiredString(value, label);
  if (!values.includes(text)) {
    throw new ValidationError(`${label} must be one of ${values.join(', ')}.`);
  }
  return text;
}

export function requiredArray(value: unknown, label: string): unknown[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ValidationError(`${label} must be a non-empty array.`);
  }
  return value;
}

export function moneyText(value: unknown, scale = 2): string {
  return Number(value ?? 0).toFixed(scale);
}

export function dateKey(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
