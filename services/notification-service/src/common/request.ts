import { timingSafeEqual } from 'node:crypto';
import { ForbiddenError, UnauthorizedError } from '@galatura/platform-kit';
import { createHmac } from 'node:crypto';
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

export function assertServiceToken(req: Request): void {
  const expected = process.env.NOTIFICATION_INGEST_TOKEN;
  if (!expected) return;

  const value = req.headers['x-service-token'];
  const actual = Array.isArray(value) ? value[0] : value;
  if (!actual || !safeEqual(actual, expected)) {
    throw new UnauthorizedError('Invalid service token.');
  }
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

export function readRawBody(req: Request): Buffer {
  const body = (req as Request & { rawBody?: Buffer }).rawBody;
  if (!body) throw new UnauthorizedError('Raw request body is unavailable.');
  return body;
}

export function verifyWebhookSignature(rawBody: Buffer, signature: string | undefined): boolean {
  const secret = process.env.SMS_WEBHOOK_SECRET;
  if (!secret || !signature) return false;

  const expected = createHmac('sha256', secret).update(rawBody).digest('hex');
  const supplied = signature.startsWith('sha256=') ? signature.slice(7) : signature;
  return safeEqual(supplied, expected);
}

function safeEqual(actual: string, expected: string): boolean {
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}
