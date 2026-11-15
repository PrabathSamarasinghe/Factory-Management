import { Injectable, Logger } from '@nestjs/common';
import {
  extractBearer,
  JwtVerifier,
  type JwksDocument,
  type Principal,
} from '@galatura/platform-kit';

export interface VerifyResult {
  valid: boolean;
  principal?: Principal;
  error?: string;
}

@Injectable()
export class JwtVerifierService {
  private readonly logger = new Logger(JwtVerifierService.name);
  private verifier: JwtVerifier | null = null;

  constructor() {
    this.initVerifier();
  }

  private initVerifier(customJwks?: JwksDocument) {
    const jwksUri =
      process.env.IDENTITY_JWKS_URI || 'http://localhost:3001/.well-known/jwks.json';

    try {
      this.verifier = new JwtVerifier({
        audience: 'galatura-services',
        issuer: 'galatura-identity',
        ...(customJwks ? { jwks: customJwks } : { jwksUri }),
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Could not initialize JwtVerifier: ${message}`);
    }
  }

  setJwks(jwks: JwksDocument) {
    this.verifier = new JwtVerifier({
      audience: 'galatura-services',
      issuer: 'galatura-identity',
      jwks,
    });
  }

  async verifyToken(headerOrToken: string | undefined): Promise<VerifyResult> {
    const token = extractBearer(headerOrToken) || headerOrToken;
    if (!token) {
      return { valid: false, error: 'Missing token' };
    }

    if (!this.verifier) {
      this.initVerifier();
    }

    if (!this.verifier) {
      return { valid: false, error: 'JWT Verifier unavailable' };
    }

    try {
      const principal = await this.verifier.verify(token);
      return { valid: true, principal };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return { valid: false, error: message };
    }
  }
}
