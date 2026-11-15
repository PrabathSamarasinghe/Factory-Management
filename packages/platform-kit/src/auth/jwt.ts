import { createPublicKey, webcrypto, type KeyObject } from 'node:crypto';
import jwt, { type Algorithm, type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { DependencyUnavailableError, InvalidTokenError } from '../errors';
import { uuidv7 } from '../ids';
import { isDataScope, type DataScope, type Principal, type ServicePrincipal } from '../types';

export interface JwksDocument {
  keys: Array<Record<string, unknown> & { kid?: string }>;
}

type FetchLike = (
  url: string,
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export interface JwtVerifierOptions {
  /** Local JWKS document (tests, offline services). */
  jwks?: JwksDocument;
  /** Remote JWKS endpoint (identity service). */
  jwksUri?: string;
  issuer?: string;
  audience: string | string[];
  algorithms?: Algorithm[];
  clockToleranceSeconds?: number;
  jwksCacheTtlMs?: number;
  fetchImpl?: FetchLike;
}

export class JwtVerifier {
  private readonly algorithms: Algorithm[];
  private readonly localKeys = new Map<string, KeyObject>();
  private readonly issuer?: string;
  private readonly audience: string | string[];
  private readonly jwksUri?: string;
  private readonly clockToleranceSeconds: number;
  private readonly jwksCacheTtlMs: number;
  private readonly fetchImpl: FetchLike;
  private remoteCache?: { keys: Map<string, KeyObject>; fetchedAt: number };
  private lastRefreshAttemptAt = 0;

  constructor(options: JwtVerifierOptions) {
    if (!options.jwks && !options.jwksUri) {
      throw new Error('JwtVerifier requires either jwks or jwksUri.');
    }

    this.algorithms = options.algorithms ?? ['RS256'];
    this.issuer = options.issuer;
    this.audience = options.audience;
    this.jwksUri = options.jwksUri;
    this.clockToleranceSeconds = options.clockToleranceSeconds ?? 30;
    this.jwksCacheTtlMs = options.jwksCacheTtlMs ?? 5 * 60_000;
    this.fetchImpl = options.fetchImpl ?? ((url: string) => fetch(url));

    for (const jwk of options.jwks?.keys ?? []) {
      if (typeof jwk.kid !== 'string') {
        continue;
      }
      try {
        this.localKeys.set(
          jwk.kid,
          createPublicKey({ key: jwk as webcrypto.JsonWebKey, format: 'jwk' }),
        );
      } catch {
        // Ignore malformed keys; a valid signing key must exist for verification.
      }
    }
  }

  async verify(token: string): Promise<Principal> {
    const decoded = jwt.decode(token, { complete: true });
    if (!decoded || typeof decoded === 'string') {
      throw new InvalidTokenError('Invalid token.');
    }

    const kid = decoded.header.kid;
    if (!kid) {
      throw new InvalidTokenError('Token is missing a key id.');
    }

    const key = await this.resolveKey(kid);

    let payload: JwtPayload;
    try {
      const verified = jwt.verify(token, key, {
        algorithms: this.algorithms,
        audience: asVerifyAudience(this.audience),
        ...(this.issuer ? { issuer: this.issuer } : {}),
        clockTolerance: this.clockToleranceSeconds,
      });
      if (typeof verified === 'string') {
        throw new Error('Unexpected string payload.');
      }
      payload = verified;
    } catch (error) {
      throw new InvalidTokenError('Invalid or expired token.', { cause: error });
    }

    return toPrincipal(payload);
  }

  private async resolveKey(kid: string): Promise<KeyObject | string> {
    const local = this.localKeys.get(kid);
    if (local) {
      return local;
    }
    if (!this.jwksUri) {
      throw new InvalidTokenError('Signing key not found.');
    }
    return this.resolveRemoteKey(kid);
  }

  private async resolveRemoteKey(kid: string): Promise<KeyObject> {
    const now = Date.now();
    const cacheFresh = this.remoteCache && now - this.remoteCache.fetchedAt < this.jwksCacheTtlMs;
    if (cacheFresh && this.remoteCache?.keys.has(kid)) {
      return this.remoteCache.keys.get(kid) as KeyObject;
    }

    if (now - this.lastRefreshAttemptAt > 10_000) {
      this.lastRefreshAttemptAt = now;
      await this.refreshRemoteKeys();
    }

    const key = this.remoteCache?.keys.get(kid);
    if (!key) {
      throw new InvalidTokenError('Signing key not found.');
    }
    return key;
  }

  private async refreshRemoteKeys(): Promise<void> {
    if (!this.jwksUri) {
      return;
    }

    let body: JwksDocument;
    try {
      const response = await this.fetchImpl(this.jwksUri);
      if (!response.ok) {
        throw new DependencyUnavailableError(`Failed to fetch JWKS (${response.status}).`);
      }
      body = (await response.json()) as JwksDocument;
    } catch (error) {
      if (error instanceof DependencyUnavailableError) {
        throw error;
      }
      throw new DependencyUnavailableError('Failed to fetch JWKS.', { cause: error });
    }

    const keys = new Map<string, KeyObject>();
    for (const jwk of body.keys ?? []) {
      if (typeof jwk.kid !== 'string') {
        continue;
      }
      try {
        keys.set(jwk.kid, createPublicKey({ key: jwk as webcrypto.JsonWebKey, format: 'jwk' }));
      } catch {
        // Skip malformed keys.
      }
    }
    this.remoteCache = { keys, fetchedAt: Date.now() };
  }
}

export interface ServiceTokenInput {
  service: string;
  scopes: string[];
}

export interface SignServiceTokenOptions {
  privateKey: string | Buffer;
  audience: string | string[];
  issuer?: string;
  keyId?: string;
  algorithm?: Algorithm;
  expiresInSeconds?: number;
}

export function signServiceToken(
  input: ServiceTokenInput,
  options: SignServiceTokenOptions,
): string {
  const signOptions: SignOptions = {
    algorithm: options.algorithm ?? 'RS256',
    audience: options.audience,
    expiresIn: options.expiresInSeconds ?? 300,
    jwtid: uuidv7(),
  };
  if (options.issuer) {
    signOptions.issuer = options.issuer;
  }
  if (options.keyId) {
    signOptions.keyid = options.keyId;
  }

  return jwt.sign(
    { sub: `service:${input.service}`, typ: 'service', scopes: input.scopes },
    options.privateKey,
    signOptions,
  );
}

export interface VerifyServiceTokenOptions {
  publicKey: string | Buffer;
  audience: string | string[];
  issuer?: string;
  algorithms?: Algorithm[];
}

export function verifyServiceToken(
  token: string,
  options: VerifyServiceTokenOptions,
): ServicePrincipal {
  let payload: JwtPayload;
  try {
    const verified = jwt.verify(token, options.publicKey, {
      algorithms: options.algorithms ?? ['RS256'],
      audience: asVerifyAudience(options.audience),
      ...(options.issuer ? { issuer: options.issuer } : {}),
    });
    if (typeof verified === 'string') {
      throw new Error('Unexpected string payload.');
    }
    payload = verified;
  } catch (error) {
    throw new InvalidTokenError('Invalid service token.', { cause: error });
  }

  if (payload.typ !== 'service' || typeof payload.sub !== 'string') {
    throw new InvalidTokenError('Invalid service token.');
  }

  return {
    subject: payload.sub,
    scopes: toStringArray(payload.scopes),
    audience: payload.aud ?? '',
    expiresAt: typeof payload.exp === 'number' ? payload.exp : undefined,
    raw: payload as unknown as Record<string, unknown>,
  };
}

type VerifyAudience = NonNullable<Parameters<typeof jwt.verify>[2]>['audience'];

function asVerifyAudience(audience: string | string[]): VerifyAudience {
  return audience as VerifyAudience;
}

export function extractBearer(header: string | undefined | null): string | null {
  if (!header) {
    return null;
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : null;
}

function toPrincipal(payload: JwtPayload): Principal {
  const subject = payload.sub;
  if (typeof subject !== 'string' || subject.length === 0) {
    throw new InvalidTokenError('Token has no subject.');
  }

  const rawScope = typeof payload.scope === 'string' ? payload.scope.toUpperCase() : undefined;
  const scope: DataScope = isDataScope(rawScope) ? rawScope : 'OWN';
  const versionValue =
    typeof payload.permVersion === 'number'
      ? payload.permVersion
      : typeof payload.permissionsVersion === 'number'
        ? payload.permissionsVersion
        : 0;

  return {
    subject,
    roles: toStringArray(payload.roles ?? payload.role),
    permissions: toStringArray(payload.permissions),
    permissionsVersion: Number.isFinite(versionValue) ? versionValue : 0,
    scope,
    audience: payload.aud ?? '',
    tokenId: typeof payload.jti === 'string' ? payload.jti : undefined,
    expiresAt: typeof payload.exp === 'number' ? payload.exp : undefined,
    raw: payload as unknown as Record<string, unknown>,
  };
}

function toStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string');
  }
  if (typeof value === 'string') {
    return value.split(/[\s,]+/).filter(Boolean);
  }
  return [];
}
