import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    input: {
      actorId?: string;
      action: string;
      entityType: string;
      entityId: string;
      details?: Prisma.InputJsonValue;
      traceId?: string;
    },
    tx?: any,
  ): Promise<void> {
    try {
      const client = tx || this.prisma;
      await client.auditLog.create({
        data: {
          actorId: input.actorId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          details: input.details,
          traceId: input.traceId,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to write inventory audit log for ${input.action}.`, error as Error);
    }
  }
}
