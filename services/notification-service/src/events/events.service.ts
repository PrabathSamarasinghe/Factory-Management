import { Injectable, Logger } from '@nestjs/common';
import { ValidationError, type EventEnvelope } from '@galatura/platform-kit';
import { AuditService } from '../audit/audit.service';
import { CollectionStatusService } from '../collection/collection-status.service';
import { OutboxService } from '../outbox/outbox.service';
import { PeopleService } from '../people/people.service';
import { PhoneService } from '../phone/phone.service';
import { PrismaService } from '../prisma/prisma.service';
import { TemplatesService } from '../templates/templates.service';
import { SmsDispatchService } from '../sms/sms-dispatch.service';
import { serializeMessage, type SmsMessageDto } from '../sms/sms.serializer';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DECIMAL_KG = /^\d+(\.\d{1,3})?$/;

@Injectable()
export class EventsService {
  private readonly logger = new Logger(EventsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly people: PeopleService,
    private readonly phone: PhoneService,
    private readonly templates: TemplatesService,
    private readonly dispatch: SmsDispatchService,
    private readonly collectionStatus: CollectionStatusService,
    private readonly outbox: OutboxService,
    private readonly audit: AuditService,
  ) {}

  async ingestCollectionFinalized(event: EventEnvelope): Promise<SmsMessageDto | null> {
    this.assertEnvelope(event);
    const payload = event.payload as Record<string, unknown>;
    const supplierId = payload.supplierId as string;
    const collectionDate = payload.collectionDate as string;
    const dailyTotalId = payload.dailyTotalId as string | undefined;
    const actorId = typeof event.actor.id === 'string' ? event.actor.id : undefined;
    const idempotencyKey = `collection-finalized:${supplierId}:${collectionDate}`;

    const existing = await this.prisma.smsMessage.findUnique({ where: { idempotencyKey } });
    if (existing) {
      return serializeMessage(existing, this.phone);
    }

    const supplier = await this.people.getSupplier(supplierId);
    const phone = supplier?.smsPhone || supplier?.phonePrimary;
    if (
      !supplier ||
      supplier.smsOptIn === false ||
      !phone ||
      !/^(\+94|94|0)\d{9}$/.test(phone.trim().replace(/[\s-]/g, ''))
    ) {
      await this.recordNotRequired(event, idempotencyKey, dailyTotalId, actorId);
      return null;
    }

    const language = process.env.SMS_LANGUAGE || 'en';
    const body = await this.templates.render('collection.finalized', language, {
      supplierName: supplier.preferredName || supplier.fullName,
      collectionDate,
      totalBags: String(payload.totalBags),
      totalNetKg: payload.totalNetKg as string,
    });
    const provider = (process.env.SMS_PROVIDER || 'FAKE').toUpperCase();
    const config = await this.prisma.smsProviderConfig.findUnique({ where: { provider } });

    let message;
    try {
      message = await this.prisma.smsMessage.create({
        data: {
          recipientPhoneEnc: await this.phone.encrypt(phone),
          recipientPersonId: supplierId,
          templateCode: 'collection.finalized',
          bodyRendered: body,
          relatedType: 'DailySupplierTotal',
          relatedId: dailyTotalId || supplierId,
          idempotencyKey,
          provider,
          senderId: config?.senderId || process.env.SMS_SENDER_ID || 'GALATURA',
        },
      });
    } catch {
      const duplicate = await this.prisma.smsMessage.findUnique({ where: { idempotencyKey } });
      if (duplicate) return serializeMessage(duplicate, this.phone);
      throw new ValidationError('Could not create SMS message.');
    }

    await this.prisma.smsProcessedEvent.upsert({
      where: { id: event.id },
      create: { id: event.id, type: event.type },
      update: {},
    });
    await this.outbox.append(
      'sms.queued',
      {
        messageId: message.id,
        relatedType: message.relatedType,
        relatedId: message.relatedId,
        eventId: event.id,
      },
      this.eventActor(event),
    );
    await this.audit.record({
      actorId,
      action: 'sms.queued',
      entityType: 'SmsMessage',
      entityId: message.id,
      metadata: { eventId: event.id, templateCode: message.templateCode },
    });
    if (dailyTotalId) {
      await this.collectionStatus.update(dailyTotalId, 'PENDING', message.id, actorId);
    }
    await this.dispatch.dispatch(message.id);

    return serializeMessage(
      (await this.prisma.smsMessage.findUnique({ where: { id: message.id } })) || message,
      this.phone,
    );
  }

  private assertEnvelope(event: EventEnvelope): void {
    if (!event || !UUID.test(event.id)) {
      throw new ValidationError('A valid event id is required.');
    }
    if (event.type !== 'collection.finalized' || event.version !== 1) {
      throw new ValidationError('Only collection.finalized v1 events are accepted.');
    }
    const payload = event.payload as Record<string, unknown> | undefined;
    if (!payload) throw new ValidationError('Event payload is required.');
    if (!UUID.test(String(payload.supplierId ?? ''))) {
      throw new ValidationError('supplierId must be a UUID.');
    }
    if (!ISO_DATE.test(String(payload.collectionDate ?? ''))) {
      throw new ValidationError('collectionDate must be a calendar date.');
    }
    if (payload.dailyTotalId !== undefined && !UUID.test(String(payload.dailyTotalId))) {
      throw new ValidationError('dailyTotalId must be a UUID.');
    }
    if (!DECIMAL_KG.test(String(payload.totalNetKg ?? ''))) {
      throw new ValidationError('totalNetKg must be a non-negative decimal string.');
    }
    if (!Number.isInteger(payload.totalBags) || Number(payload.totalBags) < 0) {
      throw new ValidationError('totalBags must be a non-negative integer.');
    }
  }

  private eventActor(event: EventEnvelope): { type: 'SYSTEM' } | { type: 'USER'; id: string } {
    if (event.actor.type === 'USER' && typeof event.actor.id === 'string') {
      return { type: 'USER', id: event.actor.id };
    }
    return { type: 'SYSTEM' };
  }

  private async recordNotRequired(
    event: EventEnvelope,
    idempotencyKey: string,
    dailyTotalId: string | undefined,
    actorId: string | undefined,
  ): Promise<void> {
    await this.prisma.smsProcessedEvent.upsert({
      where: { id: event.id },
      create: { id: event.id, type: event.type },
      update: {},
    });
    await this.audit.record({
      actorId,
      action: 'sms.not_required',
      entityType: 'DailySupplierTotal',
      entityId: dailyTotalId || idempotencyKey,
      metadata: { eventId: event.id, reason: 'NO_OPTED_IN_PHONE' },
    });
    if (dailyTotalId) {
      await this.collectionStatus.update(dailyTotalId, 'NOT_REQUIRED', undefined, actorId);
    }
    this.logger.log(`No SMS sent for ${idempotencyKey}: supplier has no opted-in phone.`);
  }
}
