import { Injectable } from '@nestjs/common';
import {
  blindIndex,
  decryptString,
  encryptString,
  EnvKeyProvider,
  normalizeIdentifier,
  type KeyProvider,
} from '@galatura/platform-kit';

@Injectable()
export class EncryptionService {
  private readonly keyProvider: KeyProvider;
  private readonly blindIndexKey: string;

  constructor() {
    const masterKey =
      process.env.PLATFORM_MASTER_KEY ||
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    const masterKeyId = process.env.PLATFORM_MASTER_KEY_ID || 'galatura-dev-1';

    this.keyProvider = new EnvKeyProvider({
      masterKey,
      keyId: masterKeyId,
    });

    this.blindIndexKey =
      process.env.PLATFORM_BLIND_INDEX_KEY ||
      'abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789';
  }

  async encrypt(plaintext: string): Promise<string> {
    if (!plaintext) return '';
    return encryptString(plaintext, this.keyProvider);
  }

  async decrypt(ciphertext: string | null | undefined): Promise<string> {
    if (!ciphertext) return '';
    return decryptString(ciphertext, this.keyProvider);
  }

  computeBlindIndex(value: string): string {
    if (!value) return '';
    return blindIndex(value, this.blindIndexKey, {
      normalize: true,
      encoding: 'hex',
    });
  }

  normalize(value: string): string {
    if (!value) return '';
    return normalizeIdentifier(value);
  }

  maskSensitive(value: string, visibleEnd = 4): string {
    if (!value) return '';
    const clean = value.trim();
    if (clean.length <= visibleEnd) return '***';
    const maskedPart = '*'.repeat(clean.length - visibleEnd);
    return maskedPart + clean.slice(-visibleEnd);
  }
}
