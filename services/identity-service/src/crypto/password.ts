import * as argon2 from '@node-rs/argon2';
import { ValidationError } from '@galatura/platform-kit';

export interface PasswordPolicyResult {
  valid: boolean;
  errors: string[];
}

export function validatePasswordPolicy(password: string): PasswordPolicyResult {
  const errors: string[] = [];
  if (!password || password.length < 10) {
    errors.push('Password must be at least 10 characters long.');
  }
  if (!/[A-Z]/.test(password)) {
    errors.push('Password must contain at least one uppercase letter.');
  }
  if (!/[a-z]/.test(password)) {
    errors.push('Password must contain at least one lowercase letter.');
  }
  if (!/[0-9]/.test(password)) {
    errors.push('Password must contain at least one number.');
  }
  if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?]/.test(password)) {
    errors.push('Password must contain at least one special character.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export function assertPasswordPolicy(password: string): void {
  const result = validatePasswordPolicy(password);
  if (!result.valid) {
    throw new ValidationError('Password does not meet complexity requirements.', {
      details: result.errors.map((msg) => ({ field: 'password', message: msg })),
    });
  }
}

export async function hashPassword(password: string): Promise<string> {
  return argon2.hash(password, {
    memoryCost: 65536, // 64 MB
    timeCost: 3,
    parallelism: 1,
    algorithm: argon2.Algorithm.Argon2id,
  });
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, password);
  } catch {
    return false;
  }
}
