import { Injectable } from '@nestjs/common';
import {
  ConflictError,
  NotFoundError,
  uuidv7,
} from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { assertPasswordPolicy, hashPassword } from '../crypto/password';
import { UserStatus } from '../../generated/prisma';

export interface CreateUserInput {
  username: string;
  password?: string;
  email?: string;
  phone?: string;
  personId?: string;
  roleIds?: string[];
}

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  async createUser(input: CreateUserInput, createdBy?: string) {
    const existingUsername = await this.prisma.user.findFirst({
      where: { username: input.username },
    });
    if (existingUsername) {
      throw new ConflictError(`Username "${input.username}" is already taken.`);
    }

    if (input.email) {
      const existingEmail = await this.prisma.user.findFirst({
        where: { email: input.email },
      });
      if (existingEmail) {
        throw new ConflictError(`Email "${input.email}" is already registered.`);
      }
    }

    const initialPassword = input.password || 'Initial@Galatura123';
    assertPasswordPolicy(initialPassword);
    const passwordHash = await hashPassword(initialPassword);

    const userId = uuidv7();

    return this.prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          id: userId,
          username: input.username,
          email: input.email ?? null,
          phone: input.phone ?? null,
          personId: input.personId ?? null,
          passwordHash,
          status: 'ACTIVE',
          mustChangePassword: true,
        },
      });

      if (input.roleIds && input.roleIds.length > 0) {
        await tx.userRole.createMany({
          data: input.roleIds.map((roleId) => ({
            userId,
            roleId,
            grantedBy: createdBy ?? null,
          })),
        });
      }

      return user;
    });
  }

  async listUsers(options?: { query?: string; status?: UserStatus; limit?: number }) {
    const limit = options?.limit ?? 50;
    return this.prisma.user.findMany({
      where: {
        deletedAt: null,
        status: options?.status,
        ...(options?.query
          ? {
              OR: [
                { username: { contains: options.query, mode: 'insensitive' } },
                { email: { contains: options.query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      select: {
        id: true,
        personId: true,
        username: true,
        email: true,
        phone: true,
        status: true,
        mustChangePassword: true,
        totpEnabled: true,
        failedAttempts: true,
        lockedUntil: true,
        lastLoginAt: true,
        createdAt: true,
        roles: {
          select: {
            role: { select: { id: true, code: true, name: true } },
          },
        },
      },
      take: limit,
      orderBy: { createdAt: 'desc' },
    });
  }

  async getUser(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id, deletedAt: null },
      select: {
        id: true,
        personId: true,
        username: true,
        email: true,
        phone: true,
        status: true,
        mustChangePassword: true,
        totpEnabled: true,
        failedAttempts: true,
        lockedUntil: true,
        lastLoginAt: true,
        createdAt: true,
        roles: {
          select: {
            role: { select: { id: true, code: true, name: true } },
          },
        },
      },
    });

    if (!user) throw new NotFoundError(`User ${id} not found.`);
    return user;
  }

  async updateUser(
    id: string,
    data: { email?: string; phone?: string; status?: UserStatus },
  ) {
    await this.getUser(id);
    return this.prisma.user.update({
      where: { id },
      data,
    });
  }

  async lockUser(id: string, durationMinutes = 60) {
    await this.getUser(id);
    const lockedUntil = new Date(Date.now() + durationMinutes * 60 * 1000);
    return this.prisma.user.update({
      where: { id },
      data: {
        status: 'LOCKED',
        lockedUntil,
      },
    });
  }

  async unlockUser(id: string) {
    await this.getUser(id);
    return this.prisma.user.update({
      where: { id },
      data: {
        status: 'ACTIVE',
        failedAttempts: 0,
        lockedUntil: null,
      },
    });
  }

  async resetPassword(id: string, newPassword?: string) {
    await this.getUser(id);
    const tempPassword = newPassword || 'Reset@Galatura123';
    assertPasswordPolicy(tempPassword);
    const passwordHash = await hashPassword(tempPassword);

    await this.prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: {
          passwordHash,
          mustChangePassword: true,
          failedAttempts: 0,
          lockedUntil: null,
        },
      });
      // Revoke all existing sessions
      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });

    return { temporaryPassword: tempPassword };
  }
}
