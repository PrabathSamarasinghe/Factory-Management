import { describe, expect, it } from 'vitest';
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpCode,
  generateTotpSecret,
  verifyTotpCode,
} from '../src/crypto/totp';

describe('TOTP (RFC 6238) & Secret Encryption', () => {
  const masterKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

  it('generates a valid base32 secret', () => {
    const secret = generateTotpSecret(20);
    expect(secret).toMatch(/^[A-Z2-7]{20,}$/);
  });

  it('generates and verifies 6-digit TOTP codes within valid time window', () => {
    const secret = generateTotpSecret(20);
    const code = generateTotpCode(secret);

    expect(code).toHaveLength(6);
    expect(/^\d{6}$/.test(code)).toBe(true);
    expect(verifyTotpCode(secret, code)).toBe(true);
    expect(verifyTotpCode(secret, '000000')).toBe(false);
  });

  it('accepts drift within ±1 time window (30 seconds)', () => {
    const secret = generateTotpSecret(20);
    const pastCode = generateTotpCode(secret, Date.now() - 30_000);
    const futureCode = generateTotpCode(secret, Date.now() + 30_000);

    expect(verifyTotpCode(secret, pastCode, 1)).toBe(true);
    expect(verifyTotpCode(secret, futureCode, 1)).toBe(true);
  });

  it('rejects codes outside drift window', () => {
    const secret = generateTotpSecret(20);
    const expiredCode = generateTotpCode(secret, Date.now() - 90_000); // 3 steps back

    expect(verifyTotpCode(secret, expiredCode, 1)).toBe(false);
  });

  it('encrypts and decrypts secrets with AES-256-GCM', () => {
    const secret = generateTotpSecret(20);
    const encrypted = encryptTotpSecret(secret, masterKey);

    expect(Buffer.isBuffer(encrypted)).toBe(true);
    expect(encrypted.length).toBeGreaterThan(28);

    const decrypted = decryptTotpSecret(encrypted, masterKey);
    expect(decrypted).toBe(secret);
  });
});
