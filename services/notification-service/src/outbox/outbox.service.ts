import { Injectable } from '@nestjs/common';
import { createEvent, type Actor, type EventEnvelope } from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class OutboxService {
  constructor(private readonly prisma: PrismaService) {}

  async append(
    type: string,
    payload: Record<string, unknown>,
    actor: Actor,
  ): Promise<EventEnvelope> {
    const event = createEvent({
      type,
      payload,
      actor,
      producer: 'notification-service',
    });
    await this.prisma.outboxEvent.create({
      data: { id: event.id, envelope: event as unknown as object },
    });
    return event;
  }
}
