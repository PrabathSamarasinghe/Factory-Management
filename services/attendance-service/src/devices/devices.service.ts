import { Injectable } from '@nestjs/common';
import {
  isUuid,
  NotFoundError,
  randomToken,
  sha256Hex,
  uuidv7,
  ValidationError,
} from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { AttendanceAuditService } from '../audit/audit.service';

export interface CreateDeviceInput {
  name: string;
  kind: 'KIOSK' | 'PERSONAL';
  locationId?: string;
}

@Injectable()
export class DevicesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AttendanceAuditService,
  ) {}

  async listDevices() {
    return this.prisma.registeredDevice.findMany({
      select: {
        id: true,
        name: true,
        locationId: true,
        kind: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async createDevice(input: CreateDeviceInput, context: { actorId?: string; ip?: string }) {
    if (!input.name) {
      throw new ValidationError('Device name is required.');
    }
    if (input.kind !== 'KIOSK' && input.kind !== 'PERSONAL') {
      throw new ValidationError('Device kind must be KIOSK or PERSONAL.');
    }
    if (input.locationId !== undefined && !isUuid(input.locationId)) {
      throw new ValidationError('locationId must be a UUID.');
    }

    const apiKey = randomToken(32);
    const device = await this.prisma.registeredDevice.create({
      data: {
        id: uuidv7(),
        name: input.name.trim(),
        locationId: input.locationId,
        kind: input.kind,
        status: 'ACTIVE',
        apiKeyHash: sha256Hex(apiKey),
      },
    });

    await this.audit.record({
      actorId: context.actorId,
      action: 'attendance.device.registered',
      entityType: 'registered_device',
      entityId: device.id,
      metadata: { kind: input.kind, locationId: input.locationId },
      ip: context.ip,
    });

    return {
      id: device.id,
      name: device.name,
      kind: device.kind,
      locationId: device.locationId,
      status: device.status,
      apiKey,
    };
  }

  async updateStatus(
    id: string,
    status: 'ACTIVE' | 'DISABLED' | 'REVOKED',
    context: { actorId?: string; ip?: string },
  ) {
    if (!['ACTIVE', 'DISABLED', 'REVOKED'].includes(status)) {
      throw new ValidationError('Invalid device status.');
    }
    const existing = await this.prisma.registeredDevice.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Device "${id}" was not found.`);
    }
    const updated = await this.prisma.registeredDevice.update({
      where: { id },
      data: { status },
      select: { id: true, name: true, kind: true, status: true, updatedAt: true },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'attendance.device.status_changed',
      entityType: 'registered_device',
      entityId: id,
      metadata: { status },
      ip: context.ip,
    });
    return updated;
  }
}
