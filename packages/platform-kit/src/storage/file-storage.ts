import { ValidationError } from '../errors';

export interface PutObjectInput {
  /** Object key relative to the configured bucket. Never an absolute path or URL. */
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
  sizeBytes?: number;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface SignedUrlOptions {
  /** Signed URL lifetime. Short-lived by default; capped at 15 minutes. */
  expiresInSeconds?: number;
  contentType?: string;
  sizeBytes?: number;
}

/**
 * Object storage boundary used by services. Server-signed URLs are the only
 * way clients read or write private objects; buckets must never be public.
 */
export interface FileStorage {
  putObject(input: PutObjectInput): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  getDownloadUrl(key: string, options?: SignedUrlOptions): Promise<string>;
  getUploadUrl(key: string, options?: SignedUrlOptions): Promise<string>;
  exists(key: string): Promise<boolean>;
}

export const DEFAULT_SIGNED_URL_SECONDS = 300;
export const MAX_SIGNED_URL_SECONDS = 900;

export function validateObjectKey(key: string): string {
  if (typeof key !== 'string' || key.length === 0) {
    throw new Error('Object key must be a non-empty string.');
  }
  if (key.length > 1024) {
    throw new Error('Object key must be at most 1024 characters.');
  }
  if (key.startsWith('/') || key.includes('\\') || key.includes('\0')) {
    throw new Error('Object key must be a relative POSIX path.');
  }
  if (
    key.split('/').some((segment) => segment === '..' || segment === '.' || segment.length === 0)
  ) {
    throw new Error('Object key must not contain empty, "." or ".." path segments.');
  }
  return key;
}

export function signedUrlExpiry(options: SignedUrlOptions = {}): number {
  const seconds = options.expiresInSeconds ?? DEFAULT_SIGNED_URL_SECONDS;
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > MAX_SIGNED_URL_SECONDS) {
    throw new Error(`expiresInSeconds must be an integer from 1 to ${MAX_SIGNED_URL_SECONDS}.`);
  }
  return seconds;
}

export function signedUrlExpiryDate(options: SignedUrlOptions = {}, now = Date.now()): Date {
  return new Date(now + signedUrlExpiry(options) * 1000);
}

export const DEFAULT_ALLOWED_UPLOAD_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const;

export const DEFAULT_MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export interface UploadValidationInput {
  key: string;
  contentType?: string;
  mimeType?: string;
  sizeBytes?: number;
}

export interface UploadValidationOptions {
  allowedMimeTypes?: readonly string[];
  maxBytes?: number;
}

export function normalizeMimeType(value: string | undefined): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new ValidationError('A MIME type is required.');
  }
  const normalized = value.split(';', 1)[0].trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/.test(normalized)) {
    throw new ValidationError(`Invalid MIME type "${value}".`);
  }
  return normalized;
}

export function sanitizeUploadFilename(filename: string): string {
  if (typeof filename !== 'string' || filename.trim().length === 0) {
    throw new ValidationError('A filename is required.');
  }
  const base = filename.normalize('NFKC').replace(/\\/g, '/').split('/').pop() ?? '';
  const safe = base
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120);
  if (safe.length === 0 || safe === '.' || safe === '..') {
    throw new ValidationError('The filename must contain at least one safe character.');
  }
  return safe;
}

export function validateUploadInput(
  input: UploadValidationInput,
  options: UploadValidationOptions = {},
): string {
  validateObjectKey(input.key);
  const mimeType = normalizeMimeType(input.contentType ?? input.mimeType);
  const allowed = options.allowedMimeTypes ?? DEFAULT_ALLOWED_UPLOAD_MIME_TYPES;
  if (!allowed.includes(mimeType)) {
    throw new ValidationError(`MIME type "${mimeType}" is not allowed.`);
  }
  const maxBytes = options.maxBytes ?? DEFAULT_MAX_UPLOAD_BYTES;
  if (input.sizeBytes !== undefined) {
    if (!Number.isInteger(input.sizeBytes) || input.sizeBytes < 1 || input.sizeBytes > maxBytes) {
      throw new ValidationError(`File size must be between 1 and ${maxBytes} bytes.`);
    }
  }
  return mimeType;
}

export function byteLength(data: Buffer | Uint8Array | string): number {
  return typeof data === 'string' ? Buffer.byteLength(data) : data.byteLength;
}
