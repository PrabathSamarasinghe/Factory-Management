import { Injectable } from '@nestjs/common';
import { decryptString, encryptString, EnvKeyProvider, type KeyProvider } from '@galatura/platform-kit';

@Injectable()
export class EncryptionService {
  private readonly keyProvider: KeyProvider;
  readonly activeKeyId: string;

  constructor() {
    const masterKey =
      process.env.PLATFORM_MASTER_KEY ||
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
    this.activeKeyId = process.env.PLATFORM_MASTER_KEY_ID || 'galatura-dev-1';

    this.keyProvider = new EnvKeyProvider({
      masterKey,
      keyId: this.activeKeyId,
    });
  }

  async encrypt(plaintext: string): Promise<string> {
    return encryptString(plaintext, this.keyProvider);
  }

  async decrypt(ciphertext: string): Promise<string> {
    return decryptString(ciphertext, this.keyProvider);
  }
}
