import {
  calculateCheckLetter,
  normalizeRegNo,
  validateRegNo,
} from '../src/pickups/regNo';

describe('supplier registration number entry', () => {
  it('normalises typed values and calculates the check letter', () => {
    expect(normalizeRegNo(' 26-0001 s ')).toBe('260001S');
    expect(calculateCheckLetter('260001')).toBe('S');
  });

  it('accepts a valid registration number', () => {
    expect(validateRegNo('260001S')).toEqual({
      normalized: '260001S',
      valid: true,
    });
    expect(validateRegNo('26 0001-s').valid).toBe(true);
  });

  it('rejects bad format, forbidden letters and checksum mismatches', () => {
    expect(validateRegNo('26001S').error).toContain('7 characters');
    expect(validateRegNo('260001I').error).toContain('not valid');
    expect(validateRegNo('260001A').error).toContain('Check letter mismatch');
  });
});
