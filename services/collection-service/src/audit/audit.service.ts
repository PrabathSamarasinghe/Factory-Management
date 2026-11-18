import { Injectable } from '@nestjs/common';
import { uuidv7 } from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestContext } from '../common/request';

export interface AuditInput extends RequestContext {
  action: string;
  entityType: string;
  entityId: string;
  metadata?: object;
}

@Injectable()
export class CollectionAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(input: AuditInput, tx?: any): Promise<void> {
    const client = tx || this.prisma;
    await client.collectionAuditLog.create({
      data: {
        id: uuidv7(),
        actorId: input.actorId ?? null,
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        metadata: input.metadata ?? undefined,
        ip: input.ip ?? null,
      },
    });
  }
}
