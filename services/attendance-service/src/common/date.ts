import { ValidationError } from '@galatura/platform-kit';

export const DEFAULT_TIMEZONE_OFFSET_MINUTES = 330;

export function timezoneOffsetMinutes(): number {
  const configured = Number(process.env.ATTENDANCE_TIMEZONE_OFFSET_MINUTES);
  return Number.isFinite(configured) ? configured : DEFAULT_TIMEZONE_OFFSET_MINUTES;
}

export function dateOnly(value: string | Date): Date {
  if (value instanceof Date) {
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!match) {
    throw new ValidationError(`Invalid date "${value}". Expected YYYY-MM-DD.`);
  }
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (formatDateOnly(parsed) !== `${match[1]}-${match[2]}-${match[3]}`) {
    throw new ValidationError(`Invalid date "${value}".`);
  }
  return parsed;
}

export function formatDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

export function addDays(value: Date | string, days: number): Date {
  const date = dateOnly(value);
  date.setUTCDate(date.getUTCDate() + days);
  return date;
}

export function eachDate(from: Date | string, to: Date | string): Date[] {
  const start = dateOnly(from);
  const end = dateOnly(to);
  if (end.getTime() < start.getTime()) {
    throw new ValidationError('The end date must not be before the start date.');
  }
  const dates: Date[] = [];
  for (let cursor = start; cursor.getTime() <= end.getTime(); cursor = addDays(cursor, 1)) {
    dates.push(cursor);
  }
  if (dates.length > 366) {
    throw new ValidationError('The date range must not exceed 366 days.');
  }
  return dates;
}

export function inclusiveDays(from: Date | string, to: Date | string): number {
  return eachDate(from, to).length;
}

export function localTimeToUtc(workDate: Date | string, hhmm: string, offsetMinutes: number): Date {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(hhmm);
  if (!match) {
    throw new ValidationError(`Invalid time "${hhmm}". Expected HH:mm.`);
  }
  const date = dateOnly(workDate);
  return new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate(),
      Number(match[1]),
      Number(match[2]),
    ) -
      offsetMinutes * 60_000,
  );
}

export function workDateFor(eventAt: Date, offsetMinutes = timezoneOffsetMinutes()): Date {
  const local = new Date(eventAt.getTime() + offsetMinutes * 60_000);
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()));
}

export function parseInstant(value: string | Date | undefined, label: string): Date {
  if (value === undefined) {
    return new Date();
  }
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ValidationError(`Invalid ${label}.`);
  }
  return date;
}

export function minutesBetween(from: Date, to: Date): number {
  return Math.max(0, Math.floor((to.getTime() - from.getTime()) / 60_000));
}
