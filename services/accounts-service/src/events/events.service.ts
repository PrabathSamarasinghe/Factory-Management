import { Injectable } from '@nestjs/common';
import { BusinessRuleError } from '@galatura/platform-kit';
import type { EventEnvelope } from '@galatura/platform-kit';
import { BillingService } from '../billing/billing.service';
import { PayrollService } from '../payroll/payroll.service';
import { PrismaService } from '../prisma/prisma.service';
import { uuid } from '../common/validation';

const SUPPORTED_TYPES = ['collection.finalized', 'attendance.day.closed'] as const;

@Injectable()
export class EventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly billing: BillingService,
    private readonly payroll: PayrollService,
  ) {}

  async ingest(event: EventEnvelope<any>) {
    const eventId = uuid(event?.id, 'event.id');
    const type = this.supportedType(event?.type);
    if (event?.version !== 1) throw new BusinessRuleError('Only event version 1 is supported.');

    const existing = await this.prisma.processedEvent.findUnique({ where: { id: eventId } });
    if (existing) return { status: 'duplicate' as const, eventId, type };

    if (type === 'collection.finalized') {
      await this.billing.ingestCollectedTotal(event);
    } else {
      await this.payroll.ingestAttendanceDay(event);
    }

    await this.prisma.processedEvent.create({ data: { id: eventId, type } });
    return { status: 'processed' as const, eventId, type };
  }

  private supportedType(value: unknown): string {
    const text = typeof value === 'string' ? value : '';
    if (!SUPPORTED_TYPES.includes(text as any)) {
      throw new BusinessRuleError(`Unsupported event type ${text || '(missing)'}.`);
    }
    return text;
  }
}
