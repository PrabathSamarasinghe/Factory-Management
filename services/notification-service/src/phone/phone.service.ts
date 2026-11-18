import { Injectable } from '@nestjs/common';
import { EnvKeyProvider, decryptString, encryptString } from '@galatura/platform-kit';

@Injectable()
export class PhoneService {
  private readonly keys: EnvKeyProvider;

  constructor() {
    this.keys = EnvKeyProvider.fromEnv();
  }

  async encrypt(phone: string): Promise<string> {
    return encryptString(this.normalize(phone), this.keys);
  }

  async decrypt(payload: string): Promise<string> {
    return decryptString(payload, this.keys);
  }

  normalize(phone: string): string {
    const clean = phone.trim().replace(/[\s-]/g, '');
    if (!/^(\+94|94|0)\d{9}$/.test(clean)) {
      return clean;
    }
    return `+94${clean.slice(-9)}`;
  }

  mask(phone: string): string {
    const normalized = this.normalize(phone);
    if (normalized.length < 8) return '[REDACTED]';
    return `${normalized.slice(0, 3)} ${'*'.repeat(5)} ${normalized.slice(-4)}`;
  }
}
