export interface PutObjectInput {
  /** Object key relative to the configured bucket. Never an absolute path or URL. */
  key: string;
  body: Buffer | Uint8Array | string;
  contentType?: string;
  cacheControl?: string;
  metadata?: Record<string, string>;
}

export interface SignedUrlOptions {
  /** Signed URL lifetime. Short-lived by default; capped at 15 minutes. */
  expiresInSeconds?: number;
  contentType?: string;
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
