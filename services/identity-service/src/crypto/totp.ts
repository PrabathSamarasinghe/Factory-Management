import { createCipheriv, createDecipheriv, createHmac, randomBytes } from 'node:crypto';

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function generateTotpSecret(length = 20): string {
  const bytes = randomBytes(length);
  let secret = '';
  for (let i = 0; i < bytes.length; i++) {
    secret += BASE32_CHARS[bytes[i] % 32];
  }
  return secret;
}

export function base32ToBuffer(base32: string): Buffer {
  const cleanBase32 = base32.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = '';
  for (const char of cleanBase32) {
    const val = BASE32_CHARS.indexOf(char);
    if (val === -1) continue;
    bits += val.toString(2).padStart(5, '0');
  }

  const bytes: number[] = [];
  for (let i = 0; i + 8 <= bits.length; i += 8) {
    bytes.push(parseInt(bits.substring(i, i + 8), 2));
  }
  return Buffer.from(bytes);
}

export function generateTotpCode(secret: string, timestamp = Date.now()): string {
  const key = base32ToBuffer(secret);
  const timeStep = Math.floor(timestamp / 1000 / 30);
  const timeBuffer = Buffer.alloc(8);
  timeBuffer.writeBigInt64BE(BigInt(timeStep), 0);

  const hmac = createHmac('sha1', key).update(timeBuffer).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);

  const otp = binary % 1_000_000;
  return otp.toString().padStart(6, '0');
}

export function verifyTotpCode(secret: string, code: string, window = 1): boolean {
  if (!code || code.length !== 6) return false;
  const now = Date.now();
  for (let i = -window; i <= window; i++) {
    const checkTime = now + i * 30 * 1000;
    if (generateTotpCode(secret, checkTime) === code) {
      return true;
    }
  }
  return false;
}

export function encryptTotpSecret(secret: string, keyHex: string): Buffer {
  const key = Buffer.from(keyHex.padEnd(64, '0').slice(0, 64), 'hex');
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Output format: [12 bytes IV][16 bytes AuthTag][encrypted payload]
  return Buffer.concat([iv, tag, encrypted]);
}

export function decryptTotpSecret(input: Buffer | Uint8Array, keyHex: string): string {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input);
  if (buffer.length < 28) {
    throw new Error('Invalid encrypted TOTP secret buffer.');
  }
  const key = Buffer.from(keyHex.padEnd(64, '0').slice(0, 64), 'hex');
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const ciphertext = buffer.subarray(28);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(ciphertext) + decipher.final('utf8');
}
