import { Injectable } from '@nestjs/common';
import { NotFoundError, uuidv7 } from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';

export interface RegisterDeviceInput {
  platform: string;
  model?: string;
  appVersion?: string;
  pushToken?: string;
  attested?: boolean;
}

@Injectable()
export class DevicesService {
  constructor(private readonly prisma: PrismaService) {}

  async registerDevice(userId: string, input: RegisterDeviceInput) {
    const existing = await this.prisma.device.findFirst({
      where: {
        userId,
        platform: input.platform,
        model: input.model ?? null,
        status: 'ACTIVE',
      },
    });

    if (existing) {
      return this.prisma.device.update({
        where: { id: existing.id },
        data: {
          appVersion: input.appVersion,
          pushToken: input.pushToken,
          attested: input.attested ?? existing.attested,
          lastSeenAt: new Date(),
        },
      });
    }

    return this.prisma.device.create({
      data: {
        id: uuidv7(),
        userId,
        platform: input.platform,
        model: input.model,
        appVersion: input.appVersion,
        pushToken: input.pushToken,
        attested: input.attested ?? false,
        status: 'ACTIVE',
        lastSeenAt: new Date(),
      },
    });
  }

  async listUserDevices(userId: string) {
    return this.prisma.device.findMany({
      where: { userId },
      orderBy: { lastSeenAt: 'desc' },
    });
  }

  async revokeDevice(deviceId: string) {
    const device = await this.prisma.device.findUnique({ where: { id: deviceId } });
    if (!device) throw new NotFoundError(`Device ${deviceId} not found.`);

    await this.prisma.$transaction(async (tx) => {
      await tx.device.update({
        where: { id: deviceId },
        data: { status: 'REVOKED' },
      });
      // Revoke all sessions tied to this device
      await tx.session.updateMany({
        where: { deviceId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    });
  }
}
