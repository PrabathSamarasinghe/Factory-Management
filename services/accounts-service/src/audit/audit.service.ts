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
      metadata?: Prisma.InputJsonValue;
    },
    tx?: any,
  ): Promise<void> {
    try {
      const client = tx || this.prisma;
      await client.accountsAuditLog.create({
        data: {
          actorId: input.actorId,
          action: input.action,
          entityType: input.entityType,
          entityId: input.entityId,
          metadata: input.metadata,
        },
      });
    } catch (error) {
      this.logger.error(`Failed to write accounts audit log for ${input.action}.`, error as Error);
    }
  }
}
