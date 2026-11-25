import { timingSafeEqual } from 'node:crypto';
import { ForbiddenError, UnauthorizedError } from '@galatura/platform-kit';
import type { Request } from 'express';

export function readHeader(req: Request, name: string): string | undefined {
  const value = req.headers[name.toLowerCase()];
  const text = Array.isArray(value) ? value[0] : value;
  return typeof text === 'string' && text.trim() ? text.trim() : undefined;
}

export function readPermissions(req: Request): string[] {
  try {
    const raw = readHeader(req, 'x-permissions');
    const parsed: unknown = JSON.parse(raw || '[]');
    return Array.isArray(parsed)
      ? parsed.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    return [];
  }
}

export function assertPermission(req: Request, permission: string): void {
  if (!readPermissions(req).includes(permission)) {
    throw new ForbiddenError(`Missing required permission "${permission}".`);
  }
}

export function assertAnyPermission(req: Request, permissions: string[]): void {
  const held = readPermissions(req);
  if (!permissions.some((permission) => held.includes(permission))) {
    throw new ForbiddenError(`Missing one of the required permissions: ${permissions.join(', ')}.`);
  }
}

export function assertServiceToken(req: Request): void {
  const expected = process.env.REALTIME_INGEST_TOKEN;
  if (!expected) return;
  const actual = readHeader(req, 'x-service-token');
  if (!actual || !safeEqual(actual, expected)) {
    throw new UnauthorizedError('Invalid service token.');
  }
}

export function readActorId(req: Request): string | undefined {
  return readHeader(req, 'x-user-id');
}

export function assertAuthenticated(req: Request): string {
  const actorId = readActorId(req);
  if (!actorId) throw new UnauthorizedError('An authenticated principal is required.');
  return actorId;
}

export function readRawBody(req: Request): string {
  const raw = (req as Request & { rawBody?: Buffer | string }).rawBody;
  if (Buffer.isBuffer(raw)) return raw.toString('utf8');
  if (typeof raw === 'string') return raw;
  return JSON.stringify(req.body ?? {});
}

export function safeEqual(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
