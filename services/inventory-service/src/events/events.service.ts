import { Injectable } from '@nestjs/common';
import { BusinessRuleError } from '@galatura/platform-kit';
import type { EventEnvelope } from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { requiredString, uuid } from '../common/validation';

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(event: EventEnvelope<any>) {
    const eventId = uuid(event?.id, 'event.id');
    const type = requiredString(event?.type, 'event.type');
    if (event?.version !== 1) throw new BusinessRuleError('Only event version 1 is supported.');

    const existing = await this.prisma.processedEvent.findUnique({ where: { id: eventId } });
    if (existing) return { status: 'duplicate' as const, eventId, type };

    await this.prisma.processedEvent.create({
      data: { id: eventId, type, processedAt: new Date() } as any,
    });
    return { status: 'ignored' as const, eventId, type };
  }
}
