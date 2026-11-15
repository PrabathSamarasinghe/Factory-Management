import { Injectable, NestMiddleware } from '@nestjs/common';
import type { Request, Response, NextFunction } from 'express';
import { uuidv7 } from '@galatura/platform-kit';
import { RateLimiterService } from './rate-limiter.service';
import { JwtVerifierService } from './jwt-verifier.service';
import { RoutePolicyService } from './route-policy.service';

@Injectable()
export class GatewayMiddleware implements NestMiddleware {
  constructor(
    private readonly rateLimiter: RateLimiterService,
    private readonly jwtVerifier: JwtVerifierService,
    private readonly routePolicy: RoutePolicyService,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    const requestId = uuidv7();
    res.setHeader('x-request-id', requestId);

    // 1. Security Headers (OWASP)
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');

    // 2. WAF Checks
    const url = req.originalUrl || req.url;
    if (url.includes('\0') || url.includes('../') || url.includes('..\\')) {
      return res.status(400).json({
        error: {
          code: 'MALFORMED_SYNTAX',
          message: 'Malformed request path or suspicious characters detected.',
          requestId,
        },
      });
    }

    // Content length limit (10MB)
    const contentLength = req.headers['content-length'];
    if (contentLength && parseInt(contentLength, 10) > 10 * 1024 * 1024) {
      return res.status(413).json({
        error: {
          code: 'PAYLOAD_TOO_LARGE',
          message: 'Request payload exceeds the 10MB limit.',
          requestId,
        },
      });
    }

    // 3. Rate Limiting
    const ip = req.ip || (req.headers['x-forwarded-for'] as string) || '127.0.0.1';
    const isAuthEndpoint = url.includes('/auth/login') || url.includes('/auth/refresh');
    const limit = isAuthEndpoint ? 10 : 100;
    const rateLimitKey = `${ip}:${isAuthEndpoint ? 'auth' : 'api'}`;

    const rateResult = await this.rateLimiter.checkLimit(rateLimitKey, limit, 60);
    res.setHeader('X-RateLimit-Limit', rateResult.limit.toString());
    res.setHeader('X-RateLimit-Remaining', rateResult.remaining.toString());

    if (!rateResult.allowed) {
      if (rateResult.retryAfterSeconds) {
        res.setHeader('Retry-After', rateResult.retryAfterSeconds.toString());
      }
      return res.status(429).json({
        error: {
          code: 'RATE_LIMITED',
          message: 'Too many requests. Please slow down and try again later.',
          requestId,
        },
      });
    }

    // 4. Public Endpoints
    if (this.routePolicy.isPublicPath(url)) {
      return next();
    }

    // 5. JWT Authentication
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
      return res.status(401).json({
        error: {
          code: 'UNAUTHORIZED',
          message: 'Missing Bearer authorization token.',
          requestId,
        },
      });
    }

    const verifyResult = await this.jwtVerifier.verifyToken(authHeader);
    if (!verifyResult.valid || !verifyResult.principal) {
      return res.status(401).json({
        error: {
          code: 'INVALID_TOKEN',
          message: verifyResult.error || 'Invalid or expired token.',
          requestId,
        },
      });
    }

    const principal = verifyResult.principal;
    const clientApp = req.headers['x-client-app'] as string | undefined;

    // 6. Route Policy Evaluation
    try {
      this.routePolicy.evaluatePolicy(url, clientApp, principal);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Forbidden';
      return res.status(403).json({
        error: {
          code: 'FORBIDDEN',
          message,
          requestId,
        },
      });
    }

    // 7. Inject verified principal headers for downstream services
    req.headers['x-user-id'] = principal.subject;
    req.headers['x-username'] = (principal.raw?.username as string) || (principal as any).username || '';
    req.headers['x-roles'] = JSON.stringify(principal.roles);
    req.headers['x-permissions'] = JSON.stringify(principal.permissions);
    req.headers['x-data-scopes'] = JSON.stringify(principal.raw?.scopes || { scope: principal.scope });

    next();
  }
}
