import { describe, expect, it } from 'vitest';
import {
  assertPasswordPolicy,
  hashPassword,
  validatePasswordPolicy,
  verifyPassword,
} from '../src/crypto/password';

describe('Password Policy & Hashing', () => {
  it('rejects passwords shorter than 10 characters', () => {
    const res = validatePasswordPolicy('Ab1!');
    expect(res.valid).toBe(false);
    expect(res.errors).toContain('Password must be at least 10 characters long.');
  });

  it('rejects passwords missing uppercase, lowercase, numbers, or special chars', () => {
    expect(validatePasswordPolicy('lowercaseonly123!').valid).toBe(false);
    expect(validatePasswordPolicy('UPPERCASEONLY123!').valid).toBe(false);
    expect(validatePasswordPolicy('NoNumbersHere!@#').valid).toBe(false);
    expect(validatePasswordPolicy('NoSpecialChar1234').valid).toBe(false);
  });

  it('accepts compliant strong passwords', () => {
    const res = validatePasswordPolicy('Factory@Galatura2026');
    expect(res.valid).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(() => assertPasswordPolicy('Factory@Galatura2026')).not.toThrow();
  });

  it('hashes and verifies passwords using Argon2id', async () => {
    const password = 'StrongPassword@123';
    const hash = await hashPassword(password);

    expect(hash).toMatch(/^\$argon2id\$/);
    expect(await verifyPassword(password, hash)).toBe(true);
    expect(await verifyPassword('WrongPassword@123', hash)).toBe(false);
  });
});
