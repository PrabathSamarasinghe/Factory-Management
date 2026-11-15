import { CanActivate, ExecutionContext, Injectable } from '@nestjs/common';
import { UnauthorizedError } from '../errors';
import type { Principal } from '../types';
import { extractBearer, type JwtVerifier } from './jwt';

interface AuthenticatedRequest {
  headers?: Record<string, string | string[] | undefined>;
  principal?: Principal;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly verifier: JwtVerifier) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const header = request.headers?.authorization;
    const token = extractBearer(Array.isArray(header) ? header[0] : header);
    if (!token) {
      throw new UnauthorizedError('Missing bearer token.');
    }
    request.principal = await this.verifier.verify(token);
    return true;
  }
}
