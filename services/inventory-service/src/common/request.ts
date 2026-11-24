import { timingSafeEqual } from 'node:crypto';
import { ForbiddenError, UnauthorizedError, ValidationError } from '@galatura/platform-kit';
import type { Request } from 'express';

export interface RequestContext {
  actorId?: string;
  ip?: string;
}

export function readPermissions(req: Request): string[] {
  try {
    const value = req.headers['x-permissions'];
    const raw = Array.isArray(value) ? value[0] : value;
    return JSON.parse(raw || '[]');
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
  const expected = process.env.INVENTORY_INGEST_TOKEN;
  if (!expected) return;

  const value = req.headers['x-service-token'];
  const actual = Array.isArray(value) ? value[0] : value;
  if (!actual || !safeEqual(actual, expected)) {
    throw new UnauthorizedError('Invalid service token.');
  }
}

export function hasServiceToken(req: Request): boolean {
  const expected = process.env.INVENTORY_INGEST_TOKEN;
  if (!expected) return false;
  const value = req.headers['x-service-token'];
  const actual = Array.isArray(value) ? value[0] : value;
  return Boolean(actual && safeEqual(actual, expected));
}

export function requireIdempotencyKey(req: Request, body?: any): string | undefined {
  const value = req.headers['idempotency-key'];
  const header = Array.isArray(value) ? value[0] : value;
  const fromBody = body?.idempotencyKey;
  const key = header?.trim() || (typeof fromBody === 'string' ? fromBody.trim() : undefined);
  return key || undefined;
}

export function readActorId(req: Request): string | undefined {
  const value = req.headers['x-user-id'];
  return (Array.isArray(value) ? value[0] : value) || undefined;
}

export function readIp(req: Request): string | undefined {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return (Array.isArray(forwarded) ? forwarded[0] : forwarded).split(',')[0].trim();
  }
  return req.ip;
}

export function contextFrom(req: Request): RequestContext {
  return { actorId: readActorId(req), ip: readIp(req) };
}

export function bodyWithIdempotency(req: Request, body: any): any {
  const key = requireIdempotencyKey(req, body);
  if (!key) throw new ValidationError('Idempotency-Key header is required.');
  return { ...(body ?? {}), idempotencyKey: key };
}

function safeEqual(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
