import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError, NotFoundError, uuidv7 } from '@galatura/platform-kit';
import { RolesService } from '../src/roles/roles.service';

describe('RolesService & Maker-Checker Workflow', () => {
  let rolesService: RolesService;
  let mockPrisma: any;
  let mockRedis: any;

  beforeEach(() => {
    mockRedis = {
      get: async () => null,
      set: async () => {},
      del: async () => {},
    };

    mockPrisma = {
      role: {
        findMany: async () => [],
        findUnique: async () => null,
        create: async (args: any) => args.data,
        update: async (args: any) => args.data,
        delete: async () => {},
      },
      userRole: {
        findMany: async () => [],
        deleteMany: async () => {},
        createMany: async () => {},
      },
      permissionChangeRequest: {
        create: async (args: any) => args.data,
        findMany: async () => [],
        findUnique: async () => null,
        update: async (args: any) => args.data,
      },
      rolePermission: {
        deleteMany: async () => {},
        createMany: async () => {},
      },
      $transaction: async (fn: any) => fn(mockPrisma),
    };

    rolesService = new RolesService(mockPrisma as any, mockRedis as any);
  });

  it('prevents deletion of system roles', async () => {
    const systemRole = {
      id: uuidv7(),
      code: 'ADMIN',
      name: 'Admin',
      isSystem: true,
      permissions: [],
    };
    mockPrisma.role.findUnique = async () => systemRole;

    await expect(rolesService.deleteRole(systemRole.id)).rejects.toThrow(
      'System roles cannot be deleted',
    );
  });

  it('creates a PENDING change request when updating role permissions', async () => {
    const roleId = uuidv7();
    const requesterId = uuidv7();
    const role = { id: roleId, code: 'CLERK', name: 'Clerk', isSystem: false };
    mockPrisma.role.findUnique = async () => role;

    const request = await rolesService.requestRolePermissions(
      roleId,
      [{ permissionId: uuidv7(), scope: 'ALL' }],
      requesterId,
    );

    expect(request.status).toBe('PENDING');
    expect(request.requestedBy).toBe(requesterId);
    expect(request.roleId).toBe(roleId);
  });

  it('prevents maker from approving their own request (Maker-Checker violation)', async () => {
    const requestId = uuidv7();
    const userId = uuidv7();
    const changeRequest = {
      id: requestId,
      roleId: uuidv7(),
      requestedBy: userId, // Same user!
      status: 'PENDING',
      change: [],
    };
    mockPrisma.permissionChangeRequest.findUnique = async () => changeRequest;

    await expect(
      rolesService.decideChangeRequest(requestId, userId, 'APPROVE'),
    ).rejects.toThrow('Maker-checker violation: You cannot approve your own permission change request.');
  });

  it('allows a second approver to approve and apply changes', async () => {
    const requestId = uuidv7();
    const makerId = uuidv7();
    const checkerId = uuidv7();
    const roleId = uuidv7();
    const permissionId = uuidv7();

    const changeRequest = {
      id: requestId,
      roleId,
      requestedBy: makerId,
      status: 'PENDING',
      change: [{ permissionId, scope: 'ALL' }],
    };

    let updatedRequest: any;
    mockPrisma.permissionChangeRequest.findUnique = async (args: any) => {
      if (updatedRequest) return updatedRequest;
      return changeRequest;
    };

    mockPrisma.permissionChangeRequest.update = async (args: any) => {
      updatedRequest = { ...changeRequest, ...args.data };
      return updatedRequest;
    };

    mockPrisma.userRole.findMany = async () => [{ userId: uuidv7() }];

    const result = await rolesService.decideChangeRequest(requestId, checkerId, 'APPROVE');
    expect(result?.status).toBe('APPROVED');
    expect(result?.approvedBy).toBe(checkerId);
  });
});
