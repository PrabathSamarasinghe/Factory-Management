import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError, UnauthorizedError, uuidv7 } from '@galatura/platform-kit';
import { AuthService } from '../src/auth/auth.service';
import { hashPassword } from '../src/crypto/password';
import { encryptTotpSecret, generateTotpCode, generateTotpSecret } from '../src/crypto/totp';

describe('AuthService (Login, Lockout, Rotation & Replay Detection)', () => {
  let authService: AuthService;
  let mockPrisma: any;
  let mockRedis: any;

  const masterKey = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  process.env.PLATFORM_MASTER_KEY = masterKey;

  beforeEach(async () => {
    mockRedis = {
      get: async () => null,
      set: async () => {},
      del: async () => {},
    };

    mockPrisma = {
      user: {
        findFirst: async () => null,
        findUnique: async () => null,
        update: async () => {},
      },
      session: {
        findFirst: async () => null,
        create: async (args: any) => args.data,
        update: async (args: any) => args.data,
        updateMany: async () => {},
      },
      device: {
        findUnique: async () => null,
        upsert: async (args: any) => args.data,
      },
      authAudit: {
        create: async () => {},
      },
    };

    authService = new AuthService(mockPrisma as any, mockRedis as any);
  });

  it('rejects non-existent users with UnauthorizedError', async () => {
    await expect(
      authService.login({ username: 'unknown', password: 'Password@123' }),
    ).rejects.toThrow(UnauthorizedError);
  });

  it('increments failed attempts on wrong password and locks on 5th attempt', async () => {
    const passwordHash = await hashPassword('ValidPassword@123');
    const user = {
      id: uuidv7(),
      username: 'testuser',
      passwordHash,
      status: 'ACTIVE',
      failedAttempts: 4,
      lockedUntil: null,
      roles: [],
      totpEnabled: false,
      totpSecretEnc: null,
      mustChangePassword: false,
    };

    mockPrisma.user.findFirst = async () => ({ ...user });

    let updatedData: any;
    mockPrisma.user.update = async (args: any) => {
      updatedData = args.data;
      return { ...user, ...args.data };
    };

    await expect(
      authService.login({ username: 'testuser', password: 'WrongPassword@123' }),
    ).rejects.toThrow(ForbiddenError);

    expect(updatedData.failedAttempts).toBe(5);
    expect(updatedData.status).toBe('LOCKED');
    expect(updatedData.lockedUntil).toBeInstanceOf(Date);
  });

  it('blocks logins when user is actively locked', async () => {
    const passwordHash = await hashPassword('ValidPassword@123');
    const user = {
      id: uuidv7(),
      username: 'lockeduser',
      passwordHash,
      status: 'LOCKED',
      failedAttempts: 5,
      lockedUntil: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
      roles: [],
      totpEnabled: false,
      totpSecretEnc: null,
    };

    mockPrisma.user.findFirst = async () => ({ ...user });

    await expect(
      authService.login({ username: 'lockeduser', password: 'ValidPassword@123' }),
    ).rejects.toThrow('temporarily locked');
  });

  it('issues tokens on successful login without 2FA', async () => {
    const passwordHash = await hashPassword('ValidPassword@123');
    const userId = uuidv7();
    const user = {
      id: userId,
      username: 'validuser',
      passwordHash,
      status: 'ACTIVE',
      failedAttempts: 0,
      lockedUntil: null,
      roles: [],
      overrides: [],
      totpEnabled: false,
      totpSecretEnc: null,
      mustChangePassword: false,
    };

    mockPrisma.user.findFirst = async () => ({ ...user });
    mockPrisma.user.findUnique = async () => ({ ...user });

    const result = await authService.login({
      username: 'validuser',
      password: 'ValidPassword@123',
    });

    expect(result.requires2fa).toBe(false);
    expect(result.tokens).toBeDefined();
    expect(result.tokens?.accessToken).toBeDefined();
    expect(result.tokens?.refreshToken).toBeDefined();
    expect(result.tokens?.expiresIn).toBe(900);
  });

  it('registers an unknown device before creating a login session', async () => {
    const passwordHash = await hashPassword('ValidPassword@123');
    const userId = uuidv7();
    const deviceId = uuidv7();
    const user = {
      id: userId,
      username: 'mobileuser',
      passwordHash,
      status: 'ACTIVE',
      failedAttempts: 0,
      lockedUntil: null,
      roles: [],
      overrides: [],
      totpEnabled: false,
      totpSecretEnc: null,
      mustChangePassword: false,
    };

    mockPrisma.user.findFirst = async () => ({ ...user });
    mockPrisma.user.findUnique = async () => ({ ...user });

    let deviceUpsertArgs: any;
    mockPrisma.device.upsert = async (args: any) => {
      deviceUpsertArgs = args;
      return args.data;
    };

    const result = await authService.login({
      username: 'mobileuser',
      password: 'ValidPassword@123',
      deviceId,
    });

    expect(result.tokens).toBeDefined();
    expect(deviceUpsertArgs.where.id).toBe(deviceId);
    expect(deviceUpsertArgs.create.userId).toBe(userId);
  });

  it('detects refresh token replay attack and revokes all sessions in family', async () => {
    const familyId = uuidv7();
    const revokedSession = {
      id: uuidv7(),
      userId: uuidv7(),
      familyId,
      refreshTokenHash: 'hash',
      expiresAt: new Date(Date.now() + 10000),
      revokedAt: new Date(Date.now() - 5000), // Already revoked!
    };

    mockPrisma.session.findFirst = async () => revokedSession;

    let revokedFamilyId: string | undefined;
    mockPrisma.session.updateMany = async (args: any) => {
      revokedFamilyId = args.where.familyId;
    };

    await expect(
      authService.refresh({ refreshToken: 'reused-token' }),
    ).rejects.toThrow('Refresh token reuse detected');

    expect(revokedFamilyId).toBe(familyId);
  });

  it('handles 2FA challenge and verification flow', async () => {
    const passwordHash = await hashPassword('ValidPassword@123');
    const totpSecret = generateTotpSecret(20);
    const encryptedSecret = encryptTotpSecret(totpSecret, masterKey);
    const userId = uuidv7();

    const user = {
      id: userId,
      username: 'totpuser',
      passwordHash,
      status: 'ACTIVE',
      failedAttempts: 0,
      lockedUntil: null,
      roles: [],
      overrides: [],
      totpEnabled: true,
      totpSecretEnc: new Uint8Array(encryptedSecret),
      mustChangePassword: false,
    };

    mockPrisma.user.findFirst = async () => ({ ...user });
    mockPrisma.user.findUnique = async () => ({ ...user });

    // Step 1: Login triggers 2FA challenge
    const loginResult = await authService.login({
      username: 'totpuser',
      password: 'ValidPassword@123',
    });

    expect(loginResult.requires2fa).toBe(true);
    expect(loginResult.challengeToken).toBeDefined();

    // Step 2: Verify 2FA code
    const validCode = generateTotpCode(totpSecret);
    const verifyResult = await authService.verify2fa({
      challengeToken: loginResult.challengeToken!,
      code: validCode,
    });

    expect(verifyResult.accessToken).toBeDefined();
    expect(verifyResult.refreshToken).toBeDefined();
  });
});
