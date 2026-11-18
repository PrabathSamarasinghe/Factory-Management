import { Injectable } from '@nestjs/common';
import type { EventEnvelope } from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async append(event: EventEnvelope, tx?: any): Promise<void> {
    const client = tx || this.prisma;
    await client.outboxEvent.create({
      data: {
        id: event.id,
        envelope: event as unknown as object,
      },
    });
  }
}
