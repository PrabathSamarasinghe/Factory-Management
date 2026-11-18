import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';

export interface FleetAuditInput {
  actorId?: string | null;
  actorType?: 'USER' | 'SERVICE' | 'SYSTEM' | 'DEVICE';
  action: string;
  entityType: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  ip?: string;
}

@Injectable()
export class FleetAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: FleetAuditInput, tx?: any): Promise<void> {
    const client = tx || this.prisma;
    await client.fleetAuditLog.create({
      data: {
        id: uuidv7(),
        actorId: input.actorId || null,
        actorType: input.actorType || 'USER',
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: (input.metadata ?? {}) as object,
        ip: input.ip,
      },
    });
  }
}
