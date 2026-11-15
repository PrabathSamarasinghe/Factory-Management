import { beforeEach, describe, expect, it } from 'vitest';
import { uuidv7 } from '@galatura/platform-kit';
import { DevicesService } from '../src/devices/devices.service';

describe('DevicesService (Device Registration & Session Revocation)', () => {
  let devicesService: DevicesService;
  let mockPrisma: any;

  beforeEach(() => {
    mockPrisma = {
      device: {
        findFirst: async () => null,
        findUnique: async () => null,
        create: async (args: any) => args.data,
        update: async (args: any) => args.data,
        findMany: async () => [],
      },
      session: {
        updateMany: async () => {},
      },
      $transaction: async (fn: any) => fn(mockPrisma),
    };

    devicesService = new DevicesService(mockPrisma as any);
  });

  it('registers a new device for a user', async () => {
    const userId = uuidv7();
    const device = await devicesService.registerDevice(userId, {
      platform: 'Android',
      model: 'Pixel 8',
      appVersion: '1.0.0',
    });

    expect(device.userId).toBe(userId);
    expect(device.platform).toBe('Android');
    expect(device.status).toBe('ACTIVE');
  });

  it('revokes device and all active sessions tied to it', async () => {
    const deviceId = uuidv7();
    const existingDevice = { id: deviceId, status: 'ACTIVE' };
    mockPrisma.device.findUnique = async () => existingDevice;

    let deviceUpdateData: any;
    mockPrisma.device.update = async (args: any) => {
      deviceUpdateData = args.data;
    };

    let sessionRevocationWhere: any;
    mockPrisma.session.updateMany = async (args: any) => {
      sessionRevocationWhere = args.where;
    };

    await devicesService.revokeDevice(deviceId);

    expect(deviceUpdateData.status).toBe('REVOKED');
    expect(sessionRevocationWhere.deviceId).toBe(deviceId);
    expect(sessionRevocationWhere.revokedAt).toBeNull();
  });
});
