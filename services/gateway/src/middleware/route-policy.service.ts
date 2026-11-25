import { Injectable } from '@nestjs/common';
import { ForbiddenError, type Principal } from '@galatura/platform-kit';

@Injectable()
export class RoutePolicyService {
  private readonly publicPaths = [
    '/healthz',
    '/.well-known/jwks.json',
    '/api/v1/identity/.well-known/jwks.json',
    '/api/v1/identity/auth/login',
    '/api/v1/identity/auth/2fa/verify',
    '/api/v1/identity/auth/refresh',
    '/api/v1/identity/auth/password/forgot',
    '/api/v1/identity/auth/password/reset',
  ];

  private readonly c7AllowedPrefixes = ['/api/v1/monitor', '/api/v1/realtime', '/realtime', '/ws'];

  isPublicPath(path: string): boolean {
    return this.publicPaths.some((p) => path === p || path.startsWith(p));
  }

  evaluatePolicy(path: string, clientApp?: string, principal?: Principal): void {
    const isC7Client = clientApp === 'C7' || principal?.roles.includes('MONITOR');

    if (isC7Client) {
      const isAllowedForC7 =
        path === '/healthz' || this.c7AllowedPrefixes.some((prefix) => path.startsWith(prefix));

      if (!isAllowedForC7) {
        throw new ForbiddenError(
          'Client policy violation: C7 / MONITOR clients are restricted to monitor, realtime and health routes.',
        );
      }
    }
  }
}
