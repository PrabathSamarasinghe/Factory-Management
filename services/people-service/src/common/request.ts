import { ForbiddenError } from '@galatura/platform-kit';
import type { Request } from 'express';

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
