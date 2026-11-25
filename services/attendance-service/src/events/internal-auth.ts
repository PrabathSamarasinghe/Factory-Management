import { timingSafeEqual } from 'node:crypto';
import { ForbiddenError } from '@galatura/platform-kit';
import type { Request } from 'express';

export const INTERNAL_TOKEN_HEADER = 'x-internal-token';

export function assertInternalServiceToken(req: Request): void {
  const expected = process.env.INTERNAL_SERVICE_TOKEN;
  const header = req.headers[INTERNAL_TOKEN_HEADER];
  const provided = (Array.isArray(header) ? header[0] : header) ?? '';
  if (!expected || !safeEqual(provided, expected)) {
    throw new ForbiddenError('A valid internal service token is required.');
  }
}

function safeEqual(left: string, right: string): boolean {
  if (typeof left !== 'string' || left.length !== right.length) {
    return false;
  }
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}
