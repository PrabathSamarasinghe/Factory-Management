import {
  createCipheriv,
  createDecipheriv,
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import {
  Algorithm,
  hash as argonHash,
  verify as argonVerify,
  type Options as Argon2Options,
} from '@node-rs/argon2';
import { EnvKeyProvider, generateMasterKey, type KeyProvider } from './key-provider';

export { EnvKeyProvider, generateMasterKey } from './key-provider';
export type { EnvKeyProviderOptions, KeyMaterial, KeyProvider } from './key-provider';

const VERSION = 'v1';
const IV_BYTES = 12;
const KEY_BYTES = 32;
const TAG_BYTES = 16;

/**
 * Encrypt a string with AES-256-GCM using a per-record data key that is
 * wrapped (encrypted) by the active key-encryption key from the provider.
 */
export async function encryptString(plaintext: string, keys: KeyProvider): Promise<string> {
  const { keyId, key } = await keys.getActiveKey();

  const dataKey = randomBytes(KEY_BYTES);
  const dataIv = randomBytes(IV_BYTES);
  const dataCipher = createCipheriv('aes-256-gcm', dataKey, dataIv, { authTagLength: TAG_BYTES });
  dataCipher.setAAD(Buffer.from(`${VERSION}:field:${keyId}`));
  const ciphertext = Buffer.concat([
    dataCipher.update(Buffer.from(plaintext, 'utf8')),
    dataCipher.final(),
  ]);
  const dataTag = dataCipher.getAuthTag();

  const wrapIv = randomBytes(IV_BYTES);
  const wrapCipher = createCipheriv('aes-256-gcm', key, wrapIv, { authTagLength: TAG_BYTES });
  wrapCipher.setAAD(Buffer.from(`${VERSION}:dek:${keyId}`));
  const wrappedKey = Buffer.concat([wrapCipher.update(dataKey), wrapCipher.final()]);
  const wrapTag = wrapCipher.getAuthTag();

  return [
    VERSION,
    keyId,
    toBase64Url(wrapIv),
    toBase64Url(wrapTag),
    toBase64Url(wrappedKey),
    toBase64Url(dataIv),
    toBase64Url(dataTag),
    toBase64Url(ciphertext),
  ].join('.');
}

/** Decrypt a value produced by {@link encryptString}. */
export async function decryptString(payload: string, keys: KeyProvider): Promise<string> {
  const parts = payload.split('.');
  if (parts.length !== 8 || parts[0] !== VERSION) {
    throw new Error('Invalid encrypted payload.');
  }

  const [, keyId, wrapIv, wrapTag, wrappedKey, dataIv, dataTag, ciphertext] = parts;
  const { key } = await keys.getKey(keyId);

  let dataKey: Buffer;
  try {
    const unwrap = createDecipheriv('aes-256-gcm', key, fromBase64Url(wrapIv), {
      authTagLength: TAG_BYTES,
    });
    unwrap.setAAD(Buffer.from(`${VERSION}:dek:${keyId}`));
    unwrap.setAuthTag(fromBase64Url(wrapTag));
    dataKey = Buffer.concat([unwrap.update(fromBase64Url(wrappedKey)), unwrap.final()]);
  } catch {
    throw new Error('Encrypted payload failed integrity check.');
  }

  try {
    const decipher = createDecipheriv('aes-256-gcm', dataKey, fromBase64Url(dataIv), {
      authTagLength: TAG_BYTES,
    });
    decipher.setAAD(Buffer.from(`${VERSION}:field:${keyId}`));
    decipher.setAuthTag(fromBase64Url(dataTag));
    return Buffer.concat([decipher.update(fromBase64Url(ciphertext)), decipher.final()]).toString(
      'utf8',
    );
  } catch {
    throw new Error('Encrypted payload failed integrity check.');
  }
}

export interface BlindIndexOptions {
  /** Normalise before hashing (uppercase, strip spaces and dashes). Default true. */
  normalize?: boolean;
  encoding?: 'base64url' | 'hex';
}

/**
 * HMAC-based blind index for equality lookups on encrypted fields.
 * Use a dedicated index key, never the encryption key.
 */
export function blindIndex(
  value: string,
  secret: string | Buffer,
  options: BlindIndexOptions = {},
): string {
  const normalized = options.normalize === false ? value : normalizeIdentifier(value);
  const digest = createHmac('sha256', secret).update(normalized, 'utf8').digest();
  return options.encoding === 'hex' ? digest.toString('hex') : digest.toString('base64url');
}

/** Uppercase and strip whitespace/dashes, as used for NIC and supplier registration numbers. */
export function normalizeIdentifier(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s-]+/g, '');
}

export type PasswordHashOptions = Partial<Argon2Options>;

const DEFAULT_ARGON2: Argon2Options = {
  algorithm: Algorithm.Argon2id,
  memoryCost: 19456,
  timeCost: 2,
  parallelism: 1,
  outputLen: 32,
};

export async function hashPassword(
  password: string,
  options: PasswordHashOptions = {},
): Promise<string> {
  if (password.length === 0) {
    throw new Error('password must not be empty');
  }
  return argonHash(password, { ...DEFAULT_ARGON2, ...options });
}

export async function verifyPassword(hash: string, password: string): Promise<boolean> {
  if (!hash || password.length === 0) {
    return false;
  }
  try {
    return await argonVerify(hash, password);
  } catch {
    return false;
  }
}

/** Cryptographically strong random token, base64url encoded. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

export function sha256Hex(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

export function constantTimeEquals(a: string | Buffer, b: string | Buffer): boolean {
  const left = typeof a === 'string' ? Buffer.from(a) : a;
  const right = typeof b === 'string' ? Buffer.from(b) : b;
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function toBase64Url(value: Buffer): string {
  return value.toString('base64url');
}

function fromBase64Url(value: string): Buffer {
  return Buffer.from(value, 'base64url');
}
