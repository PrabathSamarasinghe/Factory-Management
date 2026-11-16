import { describe, expect, it } from 'vitest';
import { ValidationError } from '@galatura/platform-kit';
import {
  assertValidPersonInputs,
  isValidSriLankanNic,
  isValidSriLankanPhone,
} from '../src/persons/nic-validator';

describe('NIC and phone validation', () => {
  it('accepts old format NIC numbers (9 digits + V/X)', () => {
    expect(isValidSriLankanNic('123456789V')).toBe(true);
    expect(isValidSriLankanNic('123456789x')).toBe(true);
    expect(isValidSriLankanNic(' 123456789V ')).toBe(true);
  });

  it('accepts new format NIC numbers (12 digits)', () => {
    expect(isValidSriLankanNic('199012345678')).toBe(true);
  });

  it('rejects malformed NIC numbers', () => {
    expect(isValidSriLankanNic('')).toBe(false);
    expect(isValidSriLankanNic('12345678V')).toBe(false);
    expect(isValidSriLankanNic('123456789A')).toBe(false);
    expect(isValidSriLankanNic('19901234567')).toBe(false);
    expect(isValidSriLankanNic('abcdefghijkl')).toBe(false);
  });

  it('accepts local and E.164 phone numbers', () => {
    expect(isValidSriLankanPhone('0712345678')).toBe(true);
    expect(isValidSriLankanPhone('+94712345678')).toBe(true);
    expect(isValidSriLankanPhone('94712345678')).toBe(true);
    expect(isValidSriLankanPhone('071-234 5678')).toBe(true);
  });

  it('rejects malformed phone numbers', () => {
    expect(isValidSriLankanPhone('')).toBe(false);
    expect(isValidSriLankanPhone('12345')).toBe(false);
    expect(isValidSriLankanPhone('07123456789')).toBe(false);
    expect(isValidSriLankanPhone('+947123456789')).toBe(false);
  });

  it('throws a ValidationError listing every invalid field', () => {
    let error: ValidationError | undefined;
    try {
      assertValidPersonInputs({
        nationalId: 'nope',
        phonePrimary: 'abc',
        phoneSecondary: 'def',
      });
    } catch (e) {
      error = e as ValidationError;
    }

    expect(error).toBeInstanceOf(ValidationError);
    const details = error?.details as { details: Array<{ field: string }> } | undefined;
    expect(details?.details.map((d) => d.field)).toEqual([
      'nationalId',
      'phonePrimary',
      'phoneSecondary',
    ]);
  });

  it('does not throw when inputs are valid or omitted', () => {
    expect(() =>
      assertValidPersonInputs({
        nationalId: '199012345678',
        phonePrimary: '0712345678',
      }),
    ).not.toThrow();
    expect(() => assertValidPersonInputs({})).not.toThrow();
  });
});
