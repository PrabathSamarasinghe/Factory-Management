export const REG_NO_ALPHABET = 'ABCDEFGHJKMNPRSTUVWXYZ';
const WEIGHTS = [7, 3, 1, 5, 2, 4];

export interface RegNoValidation {
  normalized: string;
  valid: boolean;
  error?: string;
}

export function normalizeRegNo(value: string): string {
  return value
    .trim()
    .toUpperCase()
    .replace(/[\s\-_]/g, '');
}

export function calculateCheckLetter(digits: string): string {
  if (!/^\d{6}$/.test(digits)) {
    throw new Error(
      'Registration number digits must be exactly 6 numeric characters.',
    );
  }
  let sum = 0;
  for (let index = 0; index < WEIGHTS.length; index += 1) {
    sum += Number(digits[index]) * WEIGHTS[index];
  }
  return REG_NO_ALPHABET[sum % REG_NO_ALPHABET.length];
}

export function validateRegNo(value: string): RegNoValidation {
  const normalized = normalizeRegNo(value);
  if (normalized.length !== 7) {
    return {
      normalized,
      valid: false,
      error: 'Registration number must be 7 characters (YYNNNNL).',
    };
  }
  const digits = normalized.slice(0, 6);
  const letter = normalized[6];
  if (!/^\d{6}$/.test(digits)) {
    return {
      normalized,
      valid: false,
      error: 'The first 6 characters must be digits.',
    };
  }
  if (!REG_NO_ALPHABET.includes(letter)) {
    return {
      normalized,
      valid: false,
      error: 'I, O, Q and L are not valid check letters.',
    };
  }
  const expected = calculateCheckLetter(digits);
  if (letter !== expected) {
    return {
      normalized,
      valid: false,
      error: `Check letter mismatch. Expected ${expected} for ${digits}.`,
    };
  }
  return { normalized, valid: true };
}
