import { createHash, randomBytes } from 'node:crypto';
import { Injectable, Logger } from '@nestjs/common';
import jwt from 'jsonwebtoken';
import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  uuidv7,
} from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { KeyManager } from '../crypto/keys';
import { assertPasswordPolicy, hashPassword, verifyPassword } from '../crypto/password';
import {
  decryptTotpSecret,
  encryptTotpSecret,
  generateTotpSecret,
  verifyTotpCode,
} from '../crypto/totp';

export interface TokenResponse {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  tokenType: string;
  mustChangePassword: boolean;
}

export interface LoginResult {
  requires2fa: boolean;
  challengeToken?: string;
  tokens?: TokenResponse;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  private readonly keyManager = new KeyManager();
  private readonly masterKey: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {
    this.masterKey =
      process.env.PLATFORM_MASTER_KEY ||
      '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  }

  getKeyManager(): KeyManager {
    return this.keyManager;
  }

  async login(input: {
    username: string;
    password: string;
    ip?: string;
    userAgent?: string;
    deviceId?: string;
  }): Promise<LoginResult> {
    const user = await this.prisma.user.findFirst({
      where: {
        OR: [{ username: input.username }, { email: input.username }],
        deletedAt: null,
      },
      include: {
        roles: {
          include: { role: true },
        },
      },
    });

    if (!user) {
      await this.logAudit({ event: 'LOGIN_FAILED', success: false, ip: input.ip, deviceId: input.deviceId });
      throw new UnauthorizedError('Invalid username or password.');
    }

    const now = new Date();

    // Check lockout status
    if (user.status === 'LOCKED') {
      if (user.lockedUntil && user.lockedUntil > now) {
        await this.logAudit({
          userId: user.id,
          event: 'LOGIN_BLOCKED_LOCKED',
          success: false,
          ip: input.ip,
          deviceId: input.deviceId,
        });
        throw new ForbiddenError('Account is temporarily locked due to too many failed attempts. Try again later.');
      }
      // Lock has expired, reset
      await this.prisma.user.update({
        where: { id: user.id },
        data: { status: 'ACTIVE', failedAttempts: 0, lockedUntil: null },
      });
      user.status = 'ACTIVE';
      user.failedAttempts = 0;
    } else if (user.status === 'DISABLED') {
      throw new ForbiddenError('Account is disabled. Contact your administrator.');
    }

    // Verify password
    const passwordValid = await verifyPassword(input.password, user.passwordHash);
    if (!passwordValid) {
      const failedAttempts = user.failedAttempts + 1;
      const shouldLock = failedAttempts >= 5;
      const lockUntil = shouldLock ? new Date(Date.now() + 15 * 60 * 1000) : null;

      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          failedAttempts,
          status: shouldLock ? 'LOCKED' : user.status,
          lockedUntil: lockUntil,
        },
      });

      await this.logAudit({
        userId: user.id,
        event: shouldLock ? 'ACCOUNT_LOCKED' : 'LOGIN_FAILED',
        success: false,
        ip: input.ip,
        deviceId: input.deviceId,
      });

      if (shouldLock) {
        throw new ForbiddenError('Account has been locked due to 5 consecutive failed login attempts.');
      }
      throw new UnauthorizedError('Invalid username or password.');
    }

    // Reset failed attempts on success
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedAttempts: 0,
        lockedUntil: null,
        lastLoginAt: now,
        status: user.status === 'PENDING' ? 'ACTIVE' : user.status,
      },
    });

    await this.logAudit({
      userId: user.id,
      event: 'LOGIN_SUCCESS',
      success: true,
      ip: input.ip,
      deviceId: input.deviceId,
    });

    // Check if 2FA is required
    const roleRequires2fa = user.roles.some((r) => r.role.requires2fa);
    if (user.totpEnabled || roleRequires2fa) {
      if (!user.totpSecretEnc) {
        // User must first set up 2FA
        const challengeToken = this.issueChallengeToken(user.id, true);
        return { requires2fa: true, challengeToken };
      }
      const challengeToken = this.issueChallengeToken(user.id, false);
      return { requires2fa: true, challengeToken };
    }

    // Issue tokens directly
    const tokens = await this.createSessionAndIssueTokens(user.id, input.deviceId, input.ip, input.userAgent);
    return {
      requires2fa: false,
      tokens: {
        ...tokens,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async verify2fa(input: {
    challengeToken: string;
    code: string;
    ip?: string;
    userAgent?: string;
    deviceId?: string;
  }): Promise<TokenResponse> {
    const keyInfo = this.keyManager.getActiveKey();
    let payload: jwt.JwtPayload;
    try {
      payload = jwt.verify(input.challengeToken, keyInfo.publicKey, {
        algorithms: ['RS256'],
        audience: 'galatura-services',
        issuer: 'galatura-identity',
      }) as jwt.JwtPayload;
    } catch {
      throw new UnauthorizedError('Invalid or expired 2FA challenge token.');
    }

    if (payload.typ !== '2fa_challenge' || !payload.sub) {
      throw new UnauthorizedError('Invalid 2FA challenge token.');
    }

    const userId = payload.sub;
    const user = await this.prisma.user.findUnique({
      where: { id: userId, deletedAt: null },
    });

    if (!user || !user.totpSecretEnc) {
      throw new UnauthorizedError('2FA is not configured for this user.');
    }

    const secret = decryptTotpSecret(user.totpSecretEnc, this.masterKey);
    const valid = verifyTotpCode(secret, input.code);

    if (!valid) {
      await this.logAudit({
        userId,
        event: '2FA_VERIFICATION_FAILED',
        success: false,
        ip: input.ip,
        deviceId: input.deviceId,
      });
      throw new UnauthorizedError('Invalid 2FA code.');
    }

    await this.logAudit({
      userId,
      event: '2FA_VERIFICATION_SUCCESS',
      success: true,
      ip: input.ip,
      deviceId: input.deviceId,
    });

    const tokens = await this.createSessionAndIssueTokens(userId, input.deviceId, input.ip, input.userAgent);
    return {
      ...tokens,
      mustChangePassword: user.mustChangePassword,
    };
  }

  async refresh(input: {
    refreshToken: string;
    ip?: string;
    userAgent?: string;
  }): Promise<TokenResponse> {
    const tokenHash = this.hashToken(input.refreshToken);
    const session = await this.prisma.session.findFirst({
      where: { refreshTokenHash: tokenHash },
    });

    if (!session) {
      throw new UnauthorizedError('Invalid refresh token.');
    }

    // Replay detection: If token was already revoked, an attacker is reusing an old token!
    if (session.revokedAt !== null) {
      // Revoke all sessions in this family
      await this.prisma.session.updateMany({
        where: { familyId: session.familyId, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      await this.logAudit({
        userId: session.userId,
        event: 'SESSION_REPLAY_ATTACK_DETECTED',
        success: false,
        ip: input.ip,
        deviceId: session.deviceId ?? undefined,
      });

      throw new UnauthorizedError('Refresh token reuse detected. All sessions in this family have been revoked.');
    }

    // Check expiration
    if (session.expiresAt < new Date()) {
      await this.prisma.session.update({
        where: { id: session.id },
        data: { revokedAt: new Date() },
      });
      throw new UnauthorizedError('Refresh token expired.');
    }

    // Revoke old session and issue replacement in the same family
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date() },
    });

    const newRefreshToken = randomBytes(40).toString('hex');
    const newHash = this.hashToken(newRefreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prisma.session.create({
      data: {
        id: uuidv7(),
        userId: session.userId,
        deviceId: session.deviceId,
        refreshTokenHash: newHash,
        familyId: session.familyId,
        expiresAt,
        ip: input.ip,
        userAgent: input.userAgent,
      },
    });

    const user = await this.prisma.user.findUnique({
      where: { id: session.userId },
    });

    if (!user || user.status === 'LOCKED' || user.status === 'DISABLED' || user.deletedAt) {
      throw new UnauthorizedError('User account is no longer active.');
    }

    const accessToken = await this.issueAccessToken(user.id);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900,
      tokenType: 'Bearer',
      mustChangePassword: user.mustChangePassword,
    };
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      const hash = this.hashToken(refreshToken);
      await this.prisma.session.updateMany({
        where: { refreshTokenHash: hash, userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    } else {
      await this.prisma.session.updateMany({
        where: { userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  }

  async changePassword(userId: string, input: { oldPassword: string; newPassword: string }): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundError('User not found.');

    const valid = await verifyPassword(input.oldPassword, user.passwordHash);
    if (!valid) throw new UnauthorizedError('Existing password is incorrect.');

    assertPasswordPolicy(input.newPassword);
    const newHash = await hashPassword(input.newPassword);

    await this.prisma.user.update({
      where: { id: userId },
      data: {
        passwordHash: newHash,
        mustChangePassword: false,
      },
    });

    // Invalidate all active sessions for safety
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async setup2fa(userId: string): Promise<{ secret: string; otpAuthUrl: string }> {
    const user = await this.prisma.user.findUnique({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundError('User not found.');

    const secret = generateTotpSecret();
    const encrypted = encryptTotpSecret(secret, this.masterKey);

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpSecretEnc: new Uint8Array(encrypted), totpEnabled: false },
    });

    const otpAuthUrl = `otpauth://totp/Galatura:${encodeURIComponent(user.username)}?secret=${secret}&issuer=Galatura`;
    return { secret, otpAuthUrl };
  }

  async enable2fa(userId: string, code: string): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { id: userId, deletedAt: null } });
    if (!user || !user.totpSecretEnc) {
      throw new NotFoundError('2FA setup has not been initiated.');
    }

    const secret = decryptTotpSecret(user.totpSecretEnc, this.masterKey);
    if (!verifyTotpCode(secret, code)) {
      throw new UnauthorizedError('Invalid 2FA code.');
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { totpEnabled: true },
    });
  }

  private async createSessionAndIssueTokens(
    userId: string,
    deviceId?: string,
    ip?: string,
    userAgent?: string,
  ): Promise<TokenResponse> {
    const refreshToken = randomBytes(40).toString('hex');
    const tokenHash = this.hashToken(refreshToken);
    const familyId = uuidv7();
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

    await this.prisma.session.create({
      data: {
        id: uuidv7(),
        userId,
        deviceId: deviceId ?? null,
        refreshTokenHash: tokenHash,
        familyId,
        expiresAt,
        ip,
        userAgent,
      },
    });

    const accessToken = await this.issueAccessToken(userId);

    return {
      accessToken,
      refreshToken,
      expiresIn: 900,
      tokenType: 'Bearer',
      mustChangePassword: false,
    };
  }

  async issueAccessToken(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
        overrides: {
          include: { permission: true },
        },
      },
    });

    if (!user) throw new NotFoundError('User not found.');

    const roleCodes = user.roles.map((r) => r.role.code);
    const permissionSet = new Set<string>();
    const scopes: Record<string, string> = {};

    for (const r of user.roles) {
      for (const rp of r.role.permissions) {
        permissionSet.add(rp.permission.code);
        scopes[rp.permission.code] = rp.scope;
      }
    }

    // Apply overrides
    for (const ov of user.overrides) {
      if (ov.effect === 'ALLOW') {
        permissionSet.add(ov.permission.code);
      } else if (ov.effect === 'DENY') {
        permissionSet.delete(ov.permission.code);
      }
    }

    const keyInfo = this.keyManager.getActiveKey();

    const payload = {
      sub: user.id,
      username: user.username,
      personId: user.personId,
      roles: roleCodes,
      permissions: Array.from(permissionSet),
      scopes,
      typ: 'bearer',
    };

    return jwt.sign(payload, keyInfo.privateKey, {
      algorithm: 'RS256',
      expiresIn: 900, // 15 minutes
      issuer: 'galatura-identity',
      audience: 'galatura-services',
      keyid: keyInfo.kid,
      jwtid: uuidv7(),
    });
  }

  private issueChallengeToken(userId: string, setupRequired: boolean): string {
    const keyInfo = this.keyManager.getActiveKey();
    return jwt.sign(
      { sub: userId, typ: '2fa_challenge', setupRequired },
      keyInfo.privateKey,
      {
        algorithm: 'RS256',
        expiresIn: 300, // 5 minutes
        issuer: 'galatura-identity',
        audience: 'galatura-services',
        keyid: keyInfo.kid,
        jwtid: uuidv7(),
      },
    );
  }

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private async logAudit(entry: {
    userId?: string;
    event: string;
    success: boolean;
    ip?: string;
    deviceId?: string;
  }): Promise<void> {
    try {
      await this.prisma.authAudit.create({
        data: {
          id: uuidv7(),
          userId: entry.userId ?? null,
          event: entry.event,
          success: entry.success,
          ip: entry.ip,
          deviceId: entry.deviceId ?? null,
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.error(`Failed to log auth audit: ${message}`);
    }
  }
}
