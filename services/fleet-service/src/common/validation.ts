import { ValidationError } from '@galatura/platform-kit';

const DECIMAL_PATTERN = /^\d+(\.\d+)?$/;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ValidationError(`${label} is required.`);
  }
  return value.trim();
}

export function optionalString(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new ValidationError('Expected a string value.');
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

export function optionalBoolean(value: unknown, label: string): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'boolean') throw new ValidationError(`${label} must be a boolean.`);
  return value;
}

export function decimalString(value: unknown, label: string, required: false): string | undefined;
export function decimalString(value: unknown, label: string, required?: true): string;
export function decimalString(value: unknown, label: string, required = true): string | undefined {
  if (value === undefined || value === null || value === '') {
    if (required) throw new ValidationError(`${label} is required.`);
    return undefined;
  }
  const text = String(value).trim();
  if (!DECIMAL_PATTERN.test(text)) {
    throw new ValidationError(`${label} must be a non-negative decimal number.`);
  }
  return text;
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

export function optionalDateTime(value: unknown, label: string): Date | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  return dateTime(value, label);
}

export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function todayDateOnly(now = new Date()): Date {
  return new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
}

export function decimalText(value: unknown, scale = 1): string {
  const number = Number(value ?? 0);
  return number.toFixed(scale);
}

export function addDays(value: Date, days: number): Date {
  const next = new Date(value);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / 86_400_000);
}

export function weekdays(value: unknown): number[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new ValidationError('weekdays must be an array.');
  const parsed = value.map((day) => Number(day));
  if (parsed.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) {
    throw new ValidationError('weekdays must contain numbers from 1 (Monday) to 7 (Sunday).');
  }
  return [...new Set(parsed)].sort((left, right) => left - right);
}

export function overlap(
  leftFrom: Date,
  leftTo: Date | null | undefined,
  rightFrom: Date,
  rightTo: Date | null | undefined,
): boolean {
  const leftEnd = leftTo ? leftTo.getTime() : Number.POSITIVE_INFINITY;
  const rightEnd = rightTo ? rightTo.getTime() : Number.POSITIVE_INFINITY;
  return leftFrom.getTime() < rightEnd && rightFrom.getTime() < leftEnd;
}
