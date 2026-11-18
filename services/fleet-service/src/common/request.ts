import { ForbiddenError } from '@galatura/platform-kit';
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
