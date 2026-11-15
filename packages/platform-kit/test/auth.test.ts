import { generateKeyPairSync } from 'node:crypto';
import jwt, { type SignOptions } from 'jsonwebtoken';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  DependencyUnavailableError,
  InvalidTokenError,
  JwtVerifier,
  extractBearer,
  signServiceToken,
  verifyServiceToken,
} from '../src';

const ISSUER = 'galatura-identity';
const AUDIENCE = 'galatura-api';

let privatePem: string;
let publicPem: string;
let jwks: { keys: Array<Record<string, unknown>> };

beforeAll(() => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  privatePem = privateKey.export({ type: 'pkcs8', format: 'pem' }).toString();
  publicPem = publicKey.export({ type: 'spki', format: 'pem' }).toString();
  const jwk = publicKey.export({ format: 'jwk' }) as Record<string, unknown>;
  jwks = { keys: [{ ...jwk, kid: 'test-key', alg: 'RS256', use: 'sig' }] };
});

interface SignOverrides {
  kid?: string | null;
  expiresIn?: number;
  audience?: string;
  issuer?: string;
}

function signToken(payload: Record<string, unknown> = {}, overrides: SignOverrides = {}): string {
  const options: SignOptions = {
    algorithm: 'RS256',
    audience: overrides.audience ?? AUDIENCE,
    issuer: overrides.issuer ?? ISSUER,
    expiresIn: overrides.expiresIn ?? 60,
  };
  if (overrides.kid !== null) {
    options.keyid = overrides.kid ?? 'test-key';
  }
  return jwt.sign(
    {
      sub: 'user-1',
      roles: ['SUPERVISOR'],
      scope: 'ROUTE',
      permVersion: 3,
      ...payload,
    },
    privatePem,
    options,
  );
}

function verifier(overrides: Partial<ConstructorParameters<typeof JwtVerifier>[0]> = {}) {
  return new JwtVerifier({ jwks, issuer: ISSUER, audience: AUDIENCE, ...overrides });
}

describe('JwtVerifier', () => {
  it('verifies a token and maps it to a principal', async () => {
    const principal = await verifier().verify(signToken());

    expect(principal).toMatchObject({
      subject: 'user-1',
      roles: ['SUPERVISOR'],
      scope: 'ROUTE',
      permissionsVersion: 3,
      permissions: [],
      audience: AUDIENCE,
    });
    expect(principal.expiresAt).toBeTypeOf('number');
    expect(principal.tokenId).toBeUndefined();
  });

  it('accepts array and space-delimited claim values', async () => {
    const principal = await verifier().verify(
      signToken({ roles: 'DRIVER HELPER', permissions: 'trip:read trip:start', scope: 'all' }),
    );

    expect(principal.roles).toEqual(['DRIVER', 'HELPER']);
    expect(principal.permissions).toEqual(['trip:read', 'trip:start']);
    expect(principal.scope).toBe('ALL');
  });

  it('rejects expired tokens', async () => {
    await expect(verifier().verify(signToken({}, { expiresIn: -120 }))).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });

  it('rejects the wrong audience', async () => {
    await expect(
      verifier().verify(signToken({}, { audience: 'different-api' })),
    ).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('rejects a token without a key id', async () => {
    await expect(verifier().verify(signToken({}, { kid: null }))).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });

  it('rejects an unknown signing key', async () => {
    await expect(verifier().verify(signToken({}, { kid: 'other-key' }))).rejects.toBeInstanceOf(
      InvalidTokenError,
    );
  });

  it('rejects malformed tokens', async () => {
    await expect(verifier().verify('not.a.jwt')).rejects.toBeInstanceOf(InvalidTokenError);
  });

  it('fetches and caches remote JWKS', async () => {
    let calls = 0;
    const remote = verifier({
      jwks: undefined,
      jwksUri: 'https://identity.test/.well-known/jwks.json',
      fetchImpl: async () => {
        calls += 1;
        return { ok: true, status: 200, json: async () => jwks };
      },
    });

    const token = signToken();
    await expect(remote.verify(token)).resolves.toMatchObject({ subject: 'user-1' });
    await expect(remote.verify(token)).resolves.toMatchObject({ subject: 'user-1' });
    expect(calls).toBe(1);
  });

  it('reports unavailable JWKS as a dependency error', async () => {
    const remote = verifier({
      jwks: undefined,
      jwksUri: 'https://identity.test/.well-known/jwks.json',
      fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }),
    });

    await expect(remote.verify(signToken())).rejects.toBeInstanceOf(DependencyUnavailableError);
  });

  it('requires a JWKS source', () => {
    expect(() => new JwtVerifier({ audience: AUDIENCE })).toThrow(/jwks/i);
  });
});

describe('service tokens', () => {
  it('signs and verifies service-to-service tokens', () => {
    const token = signServiceToken(
      { service: 'collection-service', scopes: ['collection:write'] },
      { privateKey: privatePem, audience: 'fleet-service', keyId: 'svc-key', issuer: ISSUER },
    );

    const principal = verifyServiceToken(token, {
      publicKey: publicPem,
      audience: 'fleet-service',
      issuer: ISSUER,
    });

    expect(principal.subject).toBe('service:collection-service');
    expect(principal.scopes).toEqual(['collection:write']);
    expect(principal.audience).toBe('fleet-service');

    const header = jwt.decode(token, { complete: true })?.header;
    expect(header?.kid).toBe('svc-key');
  });

  it('rejects service tokens for another audience', () => {
    const token = signServiceToken(
      { service: 'collection-service', scopes: [] },
      { privateKey: privatePem, audience: 'fleet-service' },
    );

    expect(() =>
      verifyServiceToken(token, { publicKey: publicPem, audience: 'other-service' }),
    ).toThrow(InvalidTokenError);
  });
});

describe('extractBearer', () => {
  it('extracts case-insensitive bearer tokens', () => {
    expect(extractBearer('Bearer abc.def')).toBe('abc.def');
    expect(extractBearer('bearer   abc')).toBe('abc');
    expect(extractBearer('Basic abc')).toBeNull();
    expect(extractBearer(undefined)).toBeNull();
    expect(extractBearer('')).toBeNull();
  });
});
