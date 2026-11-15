import { randomBytes } from 'node:crypto';

export interface KeyMaterial {
  keyId: string;
  key: Buffer;
}

/**
 * Supplies key-encryption keys (KEKs) for envelope encryption.
 * Phase 1 uses an env-held master key; AWS KMS implements the same interface later.
 */
export interface KeyProvider {
  readonly activeKeyId: string;
  getActiveKey(): Promise<KeyMaterial>;
  getKey(keyId: string): Promise<KeyMaterial>;
}

const KEY_ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;
const KEY_BYTES = 32;

export interface EnvKeyProviderOptions {
  /** 32-byte master key as base64, hex, or a Buffer. */
  masterKey: Buffer | string;
  keyId?: string;
  /** Previously used keys, kept for decryption during rotation. */
  previousKeys?: Record<string, Buffer | string>;
}

export class EnvKeyProvider implements KeyProvider {
  readonly activeKeyId: string;
  private readonly keys: Map<string, Buffer>;

  constructor(options: EnvKeyProviderOptions) {
    const keyId = options.keyId ?? 'env-1';
    assertKeyId(keyId);

    const keys = new Map<string, Buffer>();
    keys.set(keyId, parseKey(options.masterKey, 'masterKey'));
    for (const [id, value] of Object.entries(options.previousKeys ?? {})) {
      assertKeyId(id);
      keys.set(id, parseKey(value, `previousKeys.${id}`));
    }

    this.activeKeyId = keyId;
    this.keys = keys;
  }

  static fromEnv(env: NodeJS.ProcessEnv = process.env): EnvKeyProvider {
    const masterKey = env.PLATFORM_MASTER_KEY;
    if (!masterKey) {
      throw new Error('PLATFORM_MASTER_KEY is required (32 bytes, base64 or hex).');
    }
    return new EnvKeyProvider({
      masterKey,
      keyId: env.PLATFORM_MASTER_KEY_ID,
    });
  }

  async getActiveKey(): Promise<KeyMaterial> {
    return this.getKey(this.activeKeyId);
  }

  async getKey(keyId: string): Promise<KeyMaterial> {
    const key = this.keys.get(keyId);
    if (!key) {
      throw new Error(`Unknown encryption key id: ${keyId}`);
    }
    return { keyId, key: Buffer.from(key) };
  }
}

/** Generate a new 32-byte master key (base64) for `PLATFORM_MASTER_KEY`. */
export function generateMasterKey(): string {
  return randomBytes(KEY_BYTES).toString('base64');
}

function parseKey(value: Buffer | string, label: string): Buffer {
  const key =
    typeof value === 'string'
      ? Buffer.from(value, isHex(value) ? 'hex' : 'base64')
      : Buffer.from(value);

  if (key.length !== KEY_BYTES) {
    throw new Error(`${label} must be exactly ${KEY_BYTES} bytes (base64 or hex).`);
  }
  return key;
}

function isHex(value: string): boolean {
  return value.length === KEY_BYTES * 2 && /^[0-9a-f]+$/i.test(value);
}

function assertKeyId(keyId: string): void {
  if (!KEY_ID_PATTERN.test(keyId)) {
    throw new Error('keyId must match /^[A-Za-z0-9_-]{1,64}$/.');
  }
}
