import { Injectable } from '@nestjs/common';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
  uuidv7,
} from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { PermissionScope } from '../../generated/prisma';

export interface RolePermissionAssignment {
  permissionId: string;
  scope?: PermissionScope;
}

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly redis: RedisService,
  ) {}

  async listRoles() {
    return this.prisma.role.findMany({
      include: {
        permissions: {
          include: { permission: true },
        },
      },
      orderBy: { code: 'asc' },
    });
  }

  async getRole(id: string) {
    const role = await this.prisma.role.findUnique({
      where: { id },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });
    if (!role) throw new NotFoundError(`Role ${id} not found.`);
    return role;
  }

  async createRole(input: {
    code: string;
    name: string;
    description?: string;
    requires2fa?: boolean;
  }) {
    const normalizedCode = input.code.toUpperCase().trim();
    const existing = await this.prisma.role.findUnique({
      where: { code: normalizedCode },
    });
    if (existing) {
      throw new ConflictError(`Role code "${normalizedCode}" already exists.`);
    }

    return this.prisma.role.create({
      data: {
        id: uuidv7(),
        code: normalizedCode,
        name: input.name,
        description: input.description,
        isSystem: false,
        requires2fa: input.requires2fa ?? false,
      },
    });
  }

  async updateRole(
    id: string,
    input: { name?: string; description?: string; requires2fa?: boolean },
  ) {
    const role = await this.getRole(id);
    return this.prisma.role.update({
      where: { id: role.id },
      data: input,
    });
  }

  async deleteRole(id: string) {
    const role = await this.getRole(id);
    if (role.isSystem) {
      throw new ForbiddenError('System roles cannot be deleted.');
    }
    await this.prisma.role.delete({ where: { id } });
  }

  async assignUserRoles(userId: string, roleIds: string[], grantedBy?: string) {
    const user = await this.prisma.user.findFirst({ where: { id: userId, deletedAt: null } });
    if (!user) throw new NotFoundError(`User ${userId} not found.`);

    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      if (roleIds.length > 0) {
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({
            userId,
            roleId,
            grantedBy: grantedBy ?? null,
          })),
        });
      }
    });

    // Invalidate permission cache for this user
    await this.redis.del(`identity:permissions:${userId}`);
  }

  // Maker-Checker: Request permission changes for a role
  async requestRolePermissions(
    roleId: string,
    permissions: RolePermissionAssignment[],
    requestedBy: string,
  ) {
    const role = await this.getRole(roleId);

    const changeRequest = await this.prisma.permissionChangeRequest.create({
      data: {
        id: uuidv7(),
        roleId: role.id,
        requestedBy,
        change: JSON.parse(JSON.stringify(permissions)),
        status: 'PENDING',
      },
    });

    return changeRequest;
  }

  async listChangeRequests(status?: 'PENDING' | 'APPROVED' | 'REJECTED') {
    return this.prisma.permissionChangeRequest.findMany({
      where: status ? { status } : undefined,
      include: { role: true },
      orderBy: { createdAt: 'desc' },
    });
  }

  // Maker-Checker: Approve or reject permission changes
  async decideChangeRequest(
    requestId: string,
    deciderId: string,
    decision: 'APPROVE' | 'REJECT',
  ) {
    const request = await this.prisma.permissionChangeRequest.findUnique({
      where: { id: requestId },
      include: { role: true },
    });

    if (!request) throw new NotFoundError(`Change request ${requestId} not found.`);
    if (request.status !== 'PENDING') {
      throw new ConflictError(`Change request is already ${request.status}.`);
    }

    // Maker-checker defense: Requester cannot approve their own request!
    if (request.requestedBy === deciderId) {
      throw new ForbiddenError('Maker-checker violation: You cannot approve your own permission change request.');
    }

    if (decision === 'REJECT') {
      return this.prisma.permissionChangeRequest.update({
        where: { id: requestId },
        data: {
          status: 'REJECTED',
          approvedBy: deciderId,
          decidedAt: new Date(),
        },
      });
    }

    // Apply the change transactionally
    const assignments = request.change as unknown as RolePermissionAssignment[];

    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId: request.roleId } });
      if (assignments.length > 0) {
        await tx.rolePermission.createMany({
          data: assignments.map((a) => ({
            roleId: request.roleId,
            permissionId: a.permissionId,
            scope: a.scope ?? 'ALL',
          })),
        });
      }
      await tx.permissionChangeRequest.update({
        where: { id: requestId },
        data: {
          status: 'APPROVED',
          approvedBy: deciderId,
          decidedAt: new Date(),
        },
      });
    });

    // Invalidate caches for all users holding this role
    const usersWithRole = await this.prisma.userRole.findMany({
      where: { roleId: request.roleId },
      select: { userId: true },
    });

    for (const u of usersWithRole) {
      await this.redis.del(`identity:permissions:${u.userId}`);
    }

    return this.prisma.permissionChangeRequest.findUnique({ where: { id: requestId } });
  }
}
