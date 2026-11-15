import { beforeEach, describe, expect, it } from 'vitest';
import { generateKeyPairSync, createPublicKey } from 'node:crypto';
import jwt from 'jsonwebtoken';
import { GatewayMiddleware } from '../src/middleware/gateway.middleware';
import { RateLimiterService } from '../src/middleware/rate-limiter.service';
import { JwtVerifierService } from '../src/middleware/jwt-verifier.service';
import { RoutePolicyService } from '../src/middleware/route-policy.service';

describe('GatewayMiddleware & Security Attack Tests (Tasks 1.5 & 1.7)', () => {
  let middleware: GatewayMiddleware;
  let jwtVerifier: JwtVerifierService;
  let rateLimiter: RateLimiterService;
  let routePolicy: RoutePolicyService;

  // Generate test RSA keys
  const { privateKey, publicKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const pubKeyObj = createPublicKey(publicKey);
  const jwk = {
    ...pubKeyObj.export({ format: 'jwk' }),
    kid: 'test-key-1',
    alg: 'RS256',
    use: 'sig',
  };

  beforeEach(() => {
    rateLimiter = new RateLimiterService();
    jwtVerifier = new JwtVerifierService();
    jwtVerifier.setJwks({ keys: [jwk as any] });
    routePolicy = new RoutePolicyService();
    middleware = new GatewayMiddleware(rateLimiter, jwtVerifier, routePolicy);
  });

  function mockHttp(reqOverrides: any = {}) {
    const resHeaders: Record<string, string> = {};
    let statusCode = 200;
    let jsonBody: any = null;

    const url = reqOverrides.url || '/api/v1/users';
    const req: any = {
      url,
      originalUrl: reqOverrides.originalUrl || url,
      headers: {},
      ip: '127.0.0.1',
      ...reqOverrides,
    };

    const res: any = {
      setHeader: (name: string, value: string) => {
        resHeaders[name.toLowerCase()] = value;
      },
      status: (code: number) => {
        statusCode = code;
        return res;
      },
      json: (data: any) => {
        jsonBody = data;
        return res;
      },
    };

    let nextCalled = false;
    const next = () => {
      nextCalled = true;
    };

    return { req, res, getStatus: () => statusCode, getBody: () => jsonBody, isNext: () => nextCalled, resHeaders };
  }

  it('sets standard OWASP security headers', async () => {
    const { req, res, resHeaders, isNext } = mockHttp({ url: '/healthz' });
    await middleware.use(req, res, () => {});

    expect(resHeaders['x-content-type-options']).toBe('nosniff');
    expect(resHeaders['x-frame-options']).toBe('DENY');
    expect(resHeaders['strict-transport-security']).toBeDefined();
    expect(resHeaders['x-request-id']).toBeDefined();
  });

  it('rejects path traversal attempts with 400', async () => {
    const { req, res, getStatus, getBody, isNext } = mockHttp({ url: '/api/v1/identity/../../etc/passwd' });
    await middleware.use(req, res, () => {});

    expect(getStatus()).toBe(400);
    expect(getBody().error.code).toBe('MALFORMED_SYNTAX');
    expect(isNext()).toBe(false);
  });

  it('rejects null byte injection with 400', async () => {
    const { req, res, getStatus, getBody, isNext } = mockHttp({ url: '/api/v1/identity/users\0admin' });
    await middleware.use(req, res, () => {});

    expect(getStatus()).toBe(400);
    expect(getBody().error.code).toBe('MALFORMED_SYNTAX');
    expect(isNext()).toBe(false);
  });

  it('rejects oversized payloads (>10MB) with 413', async () => {
    const { req, res, getStatus, getBody, isNext } = mockHttp({
      headers: { 'content-length': (11 * 1024 * 1024).toString() },
    });
    await middleware.use(req, res, () => {});

    expect(getStatus()).toBe(413);
    expect(getBody().error.code).toBe('PAYLOAD_TOO_LARGE');
    expect(isNext()).toBe(false);
  });

  it('allows public paths without authentication', async () => {
    const { req, res, isNext } = mockHttp({ url: '/healthz' });
    let nextCalled = false;
    await middleware.use(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
  });

  it('rejects protected routes when Bearer token is missing with 401', async () => {
    const { req, res, getStatus, getBody, isNext } = mockHttp({ url: '/api/v1/users' });
    await middleware.use(req, res, () => {});

    expect(getStatus()).toBe(401);
    expect(getBody().error.code).toBe('UNAUTHORIZED');
    expect(isNext()).toBe(false);
  });

  it('Security Test: rejects tampered JWT tokens with 401', async () => {
    const token = jwt.sign(
      { sub: 'user-1', roles: ['ADMIN'], permissions: ['user:*'] },
      privateKey,
      { algorithm: 'RS256', keyid: 'test-key-1', audience: 'galatura-services', issuer: 'galatura-identity', expiresIn: 300 },
    );

    // Tamper with signature
    const tampered = token.slice(0, -6) + 'xxxxxx';

    const { req, res, getStatus, getBody, isNext } = mockHttp({
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${tampered}` },
    });

    await middleware.use(req, res, () => {});

    expect(getStatus()).toBe(401);
    expect(getBody().error.code).toBe('INVALID_TOKEN');
    expect(isNext()).toBe(false);
  });

  it('Security Test: rejects expired JWT tokens with 401', async () => {
    const expiredToken = jwt.sign(
      { sub: 'user-1', roles: ['ADMIN'], permissions: ['user:*'] },
      privateKey,
      { algorithm: 'RS256', keyid: 'test-key-1', audience: 'galatura-services', issuer: 'galatura-identity', expiresIn: -120 },
    );

    const { req, res, getStatus, getBody } = mockHttp({
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${expiredToken}` },
    });

    await middleware.use(req, res, () => {});

    expect(getStatus()).toBe(401);
    expect(getBody().error.code).toBe('INVALID_TOKEN');
  });

  it('Security Test: rejects tokens signed by untrusted key', async () => {
    // Generate unrelated attacker keypair
    const attackerKey = generateKeyPairSync('rsa', {
      modulusLength: 2048,
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      publicKeyEncoding: { type: 'spki', format: 'pem' },
    });

    const forgedToken = jwt.sign(
      { sub: 'admin', roles: ['ADMIN'], permissions: ['*'] },
      attackerKey.privateKey,
      { algorithm: 'RS256', keyid: 'attacker-key', audience: 'galatura-services', issuer: 'galatura-identity', expiresIn: 300 },
    );

    const { req, res, getStatus, getBody } = mockHttp({
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${forgedToken}` },
    });

    await middleware.use(req, res, () => {});

    expect(getStatus()).toBe(401);
    expect(getBody().error.code).toBe('INVALID_TOKEN');
  });

  it('passes valid JWT and injects downstream headers', async () => {
    const validToken = jwt.sign(
      { sub: 'user-123', username: 'prabath', roles: ['ADMIN'], permissions: ['user:read', 'role:read'] },
      privateKey,
      { algorithm: 'RS256', keyid: 'test-key-1', audience: 'galatura-services', issuer: 'galatura-identity', expiresIn: 300 },
    );

    const { req, res } = mockHttp({
      url: '/api/v1/users',
      headers: { authorization: `Bearer ${validToken}` },
    });

    let nextCalled = false;
    await middleware.use(req, res, () => {
      nextCalled = true;
    });

    expect(nextCalled).toBe(true);
    expect(req.headers['x-user-id']).toBe('user-123');
    expect(req.headers['x-username']).toBe('prabath');
    expect(JSON.parse(req.headers['x-roles'])).toEqual(['ADMIN']);
    expect(JSON.parse(req.headers['x-permissions'])).toEqual(['user:read', 'role:read']);
  });
});
