import { ValidationError } from '@galatura/platform-kit';

/**
 * Validates Sri Lankan National Identity Card (NIC) numbers.
 * - Old format: 9 digits followed by 'V' or 'X' (case-insensitive)
 * - New format: 12 digits
 */
export function isValidSriLankanNic(nic: string): boolean {
  if (!nic) return false;
  const clean = nic.trim().toUpperCase();
  const oldNicPattern = /^\d{9}[VX]$/;
  const newNicPattern = /^\d{12}$/;
  return oldNicPattern.test(clean) || newNicPattern.test(clean);
}

/**
 * Validates Sri Lankan phone numbers.
 * Supports:
 * - Local: 07XXXXXXXX (10 digits)
 * - E.164: +947XXXXXXXX (12 chars) or 947XXXXXXXX
 */
export function isValidSriLankanPhone(phone: string): boolean {
  if (!phone) return false;
  const clean = phone.trim().replace(/[\s-]/g, '');
  const pattern = /^(\+94|94|0)\d{9}$/;
  return pattern.test(clean);
}

export function assertValidPersonInputs(inputs: {
  nationalId?: string;
  phonePrimary?: string;
  phoneSecondary?: string;
}): void {
  const errors: Array<{ field: string; message: string }> = [];

  if (inputs.nationalId && !isValidSriLankanNic(inputs.nationalId)) {
    errors.push({
      field: 'nationalId',
      message: 'Invalid Sri Lankan NIC format. Must be 9 digits + V/X or 12 digits.',
    });
  }

  if (inputs.phonePrimary && !isValidSriLankanPhone(inputs.phonePrimary)) {
    errors.push({
      field: 'phonePrimary',
      message: 'Invalid Sri Lankan phone number format.',
    });
  }

  if (inputs.phoneSecondary && !isValidSriLankanPhone(inputs.phoneSecondary)) {
    errors.push({
      field: 'phoneSecondary',
      message: 'Invalid Sri Lankan secondary phone number format.',
    });
  }

  if (errors.length > 0) {
    throw new ValidationError('Validation failed for person details.', { details: errors });
  }
}
