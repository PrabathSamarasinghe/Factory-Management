import { Injectable } from '@nestjs/common';
import { NotFoundError } from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';

export interface UserPermissionSummary {
  userId: string;
  roles: string[];
  permissions: string[];
  scopes: Record<string, string>;
}

@Injectable()
export class PermissionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async listPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  async getUserPermissions(userId: string): Promise<UserPermissionSummary> {
    const cacheKey = `identity:permissions:${userId}`;
    const cached = await this.redis.get(cacheKey);
    if (cached) {
      try {
        return JSON.parse(cached);
      } catch {
        // Fallback to fresh computation
      }
    }

    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
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

    if (!user) {
      throw new NotFoundError(`User ${userId} not found.`);
    }

    const roles = user.roles.map((r) => r.role.code);
    const permissionSet = new Set<string>();
    const scopes: Record<string, string> = {};

    for (const ur of user.roles) {
      for (const rp of ur.role.permissions) {
        permissionSet.add(rp.permission.code);
        scopes[rp.permission.code] = rp.scope;
      }
    }

    for (const ov of user.overrides) {
      if (ov.effect === 'ALLOW') {
        permissionSet.add(ov.permission.code);
      } else if (ov.effect === 'DENY') {
        permissionSet.delete(ov.permission.code);
      }
    }

    const summary: UserPermissionSummary = {
      userId,
      roles,
      permissions: Array.from(permissionSet),
      scopes,
    };

    await this.redis.set(cacheKey, JSON.stringify(summary), 3600); // 1 hour TTL
    return summary;
  }

  async getUserProfile(userId: string) {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: {
        id: true,
        personId: true,
        username: true,
        email: true,
        phone: true,
        status: true,
        totpEnabled: true,
        mustChangePassword: true,
        lastLoginAt: true,
        createdAt: true,
        roles: {
          select: {
            role: {
              select: { id: true, code: true, name: true },
            },
          },
        },
      },
    });

    if (!user) throw new NotFoundError(`User ${userId} not found.`);
    return user;
  }
}
