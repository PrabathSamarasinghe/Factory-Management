import { describe, expect, it } from 'vitest';
import {
  EnvKeyProvider,
  blindIndex,
  constantTimeEquals,
  decryptString,
  encryptString,
  generateMasterKey,
  hashPassword,
  normalizeIdentifier,
  randomToken,
  sha256Hex,
  verifyPassword,
} from '../src';

function provider(keyId = 'test-1') {
  return new EnvKeyProvider({ masterKey: generateMasterKey(), keyId });
}

describe('envelope encryption', () => {
  it('round-trips strings', async () => {
    const keys = provider();
    const ciphertext = await encryptString('NIC 199012345678', keys);

    expect(ciphertext.startsWith('v1.test-1.')).toBe(true);
    expect(ciphertext).not.toContain('199012345678');
    await expect(decryptString(ciphertext, keys)).resolves.toBe('NIC 199012345678');
  });

  it('produces different ciphertext for the same plaintext', async () => {
    const keys = provider();
    const [a, b] = await Promise.all([encryptString('same', keys), encryptString('same', keys)]);
    expect(a).not.toBe(b);
  });

  it('rejects tampered ciphertext', async () => {
    const keys = provider();
    const ciphertext = await encryptString('sensitive', keys);
    const tampered = `${ciphertext.slice(0, -2)}${ciphertext.endsWith('AA') ? 'BB' : 'AA'}`;
    await expect(decryptString(tampered, keys)).rejects.toThrow(/integrity/i);
  });

  it('rejects a different key', async () => {
    const ciphertext = await encryptString('sensitive', provider());
    await expect(decryptString(ciphertext, provider())).rejects.toThrow(/integrity/i);
  });

  it('decrypts with a previous key during rotation', async () => {
    const oldKey = generateMasterKey();
    const oldProvider = new EnvKeyProvider({ masterKey: oldKey, keyId: 'old' });
    const ciphertext = await encryptString('rotate me', oldProvider);

    const rotated = new EnvKeyProvider({
      masterKey: generateMasterKey(),
      keyId: 'new',
      previousKeys: { old: oldKey },
    });
    await expect(decryptString(ciphertext, rotated)).resolves.toBe('rotate me');
  });

  it('rejects malformed keys and payloads', async () => {
    expect(() => new EnvKeyProvider({ masterKey: 'short', keyId: 'k' })).toThrow(/32 bytes/);
    await expect(decryptString('v1.test-1.a.b.c.d.e.f', provider())).rejects.toThrow(/integrity/i);
    await expect(decryptString('nonsense', provider())).rejects.toThrow(/invalid/i);
  });
});

describe('blind index and identifiers', () => {
  it('normalises identifiers', () => {
    expect(normalizeIdentifier(' 12-345 678 v ')).toBe('12345678V');
  });

  it('is deterministic and insensitive to case/spacing', () => {
    const secret = 'index-secret';
    expect(blindIndex('AB-123', secret)).toBe(blindIndex('ab 123', secret));
    expect(blindIndex('AB-123', secret)).not.toBe(blindIndex('AB-123', 'other-secret'));
    expect(blindIndex('AB-123', secret, { encoding: 'hex' })).toHaveLength(64);
  });
});

describe('password hashing', () => {
  it('hashes and verifies passwords', async () => {
    const hash = await hashPassword('correct horse battery staple');
    expect(hash.startsWith('$argon2id$')).toBe(true);
    await expect(verifyPassword(hash, 'correct horse battery staple')).resolves.toBe(true);
    await expect(verifyPassword(hash, 'wrong')).resolves.toBe(false);
    await expect(verifyPassword('not-a-hash', 'anything')).resolves.toBe(false);
    await expect(hashPassword('')).rejects.toThrow(/empty/i);
  }, 20_000);
});

describe('misc crypto helpers', () => {
  it('generates tokens and hashes', () => {
    const token = randomToken(16);
    expect(Buffer.from(token, 'base64url')).toHaveLength(16);
    expect(sha256Hex('abc')).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('compares strings in constant time', () => {
    expect(constantTimeEquals('abc', 'abc')).toBe(true);
    expect(constantTimeEquals('abc', 'abd')).toBe(false);
    expect(constantTimeEquals('abc', 'abcd')).toBe(false);
  });
});
