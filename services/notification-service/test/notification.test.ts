import { createHmac, randomBytes } from 'node:crypto';
import { createEvent, uuidv7 } from '@galatura/platform-kit';
import { ConflictError } from '@galatura/platform-kit';
import { AuditService } from '../src/audit/audit.service';
import { CollectionStatusService } from '../src/collection/collection-status.service';
import { EventsService } from '../src/events/events.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { PeopleService } from '../src/people/people.service';
import { PhoneService } from '../src/phone/phone.service';
import { SmsDispatchService } from '../src/sms/sms-dispatch.service';
import { SmsService } from '../src/sms/sms.service';
import { TemplatesService } from '../src/templates/templates.service';
import { WebhookService } from '../src/webhooks/webhook.service';

function buildPrisma() {
  const tables: Record<string, any[]> = {
    smsTemplate: [],
    smsMessage: [],
    smsDeadLetter: [],
    smsProcessedEvent: [],
    smsProviderConfig: [],
    smsAuditLog: [],
    outboxEvent: [],
  };

  function where(row: any, filter: Record<string, any> = {}): boolean {
    return Object.entries(filter).every(([key, value]) => {
      if (value && typeof value === 'object' && 'increment' in value) return true;
      if (value && typeof value === 'object' && 'gte' in value) {
        return row[key] != null && new Date(row[key]) >= new Date(value.gte);
      }
      if (value && typeof value === 'object' && 'lt' in value) {
        return String(row[key]) < String(value.lt);
      }
      if (value && typeof value === 'object' && 'lte' in value) {
        return row[key] != null && new Date(row[key]) <= new Date(value.lte);
      }
      return row[key] === value;
    });
  }

  function applyUpdate(row: any, data: Record<string, any>): any {
    for (const [key, value] of Object.entries(data)) {
      if (value && typeof value === 'object' && 'increment' in value) {
        row[key] = Number(row[key] ?? 0) + Number(value.increment);
      } else {
        row[key] = value;
      }
    }
    row.updatedAt = new Date();
    return row;
  }

  return {
    __tables: tables,
    smsTemplate: {
      findFirst: async ({ where: filter }: any) =>
        tables.smsTemplate.find((row) => where(row, filter)) ?? null,
    },
    smsMessage: {
      findUnique: async ({ where: filter }: any) =>
        tables.smsMessage.find((row) => where(row, filter)) ?? null,
      findFirst: async ({ where: filter }: any) =>
        tables.smsMessage.find((row) => where(row, filter)) ?? null,
      findMany: async ({ where: filter = {}, orderBy, take }: any = {}) => {
        let rows = tables.smsMessage.filter((row) => where(row, filter));
        if (orderBy?.nextAttemptAt === 'asc') {
          rows = [...rows].sort((a, b) =>
            String(a.nextAttemptAt ?? '').localeCompare(String(b.nextAttemptAt ?? '')),
          );
        }
        return take ? rows.slice(0, take) : rows;
      },
      count: async ({ where: filter = {} }: any = {}) =>
        tables.smsMessage.filter((row) => where(row, filter)).length,
      create: async ({ data }: any) => {
        const row = {
          id: data.id ?? uuidv7(),
          attempts: 0,
          status: 'QUEUED',
          queuedAt: data.queuedAt ?? new Date(),
          sentAt: null,
          deliveredAt: null,
          providerMessageId: null,
          lastError: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data,
        };
        tables.smsMessage.push(row);
        return row;
      },
      update: async ({ where: filter, data }: any) => {
        const row = tables.smsMessage.find((item) => where(item, filter));
        if (!row) throw new Error('not found');
        return applyUpdate(row, data);
      },
    },
    smsDeadLetter: {
      upsert: async ({ where: filter, create, update }: any) => {
        const row = tables.smsDeadLetter.find((item) => where(item, filter));
        if (row) return applyUpdate(row, update);
        const created = { id: uuidv7(), createdAt: new Date(), ...create };
        tables.smsDeadLetter.push(created);
        return created;
      },
      findUnique: async ({ where: filter }: any) =>
        tables.smsDeadLetter.find((row) => where(row, filter)) ?? null,
      findMany: async () => tables.smsDeadLetter,
    },
    smsProcessedEvent: {
      upsert: async ({ where: filter, create }: any) => {
        const row = tables.smsProcessedEvent.find((item) => where(item, filter));
        if (row) return row;
        tables.smsProcessedEvent.push({ createdAt: new Date(), ...create });
        return create;
      },
    },
    smsProviderConfig: {
      findUnique: async () =>
        tables.smsProviderConfig[0] ?? {
          provider: 'FAKE',
          senderId: 'GALATURA',
          dailyLimit: 500,
          monthlyLimit: 10000,
          costPerMessage: { toString: () => '0.0500' },
        },
    },
    smsAuditLog: {
      create: async ({ data }: any) => {
        const row = { id: uuidv7(), createdAt: new Date(), ...data };
        tables.smsAuditLog.push(row);
        return row;
      },
    },
    outboxEvent: {
      create: async ({ data }: any) => {
        tables.outboxEvent.push({ createdAt: new Date(), ...data });
        return data;
      },
    },
  };
}

function finalizedEvent(supplierId: string, dailyTotalId: string) {
  return createEvent({
    type: 'collection.finalized',
    version: 1,
    producer: 'collection-service',
    actor: { type: 'USER', id: uuidv7() },
    payload: {
      dailyTotalId,
      tripId: uuidv7(),
      supplierId,
      collectionDate: '2026-11-18',
      totalNetKg: '1250.500',
      totalBags: 25,
      finalizedAt: new Date().toISOString(),
      finalizedBy: uuidv7(),
    },
  });
}

describe('notification service', () => {
  let prisma: any;
  let phone: PhoneService;
  let templates: TemplatesService;
  let audit: AuditService;
  let outbox: OutboxService;
  let collectionStatus: { update: ReturnType<typeof vi.fn> };
  let people: { getSupplier: ReturnType<typeof vi.fn> };
  let provider: { send: ReturnType<typeof vi.fn> };
  let dispatch: SmsDispatchService;
  let events: EventsService;
  let sms: SmsService;

  beforeEach(() => {
    process.env.PLATFORM_MASTER_KEY = randomBytes(32).toString('base64');
    process.env.SMS_PROVIDER = 'FAKE';
    process.env.SMS_WEBHOOK_SECRET = 'webhook-secret';
    process.env.SMS_MAX_ATTEMPTS = '3';
    delete process.env.NOTIFICATION_INGEST_TOKEN;

    prisma = buildPrisma();
    prisma.__tables.smsTemplate.push({
      id: uuidv7(),
      code: 'collection.finalized',
      language: 'en',
      body: 'GALATURA: {{supplierName}} {{totalBags}} bags {{totalNetKg}} kg {{collectionDate}}',
      active: true,
    });
    phone = new PhoneService();
    templates = new TemplatesService(prisma);
    audit = new AuditService(prisma);
    outbox = new OutboxService(prisma);
    collectionStatus = { update: vi.fn().mockResolvedValue(undefined) };
    people = {
      getSupplier: vi.fn().mockResolvedValue({
        supplierId: '11111111-1111-4111-8111-111111111111',
        fullName: 'Supplier One',
        preferredName: 'One',
        phonePrimary: '0771234567',
        smsPhone: null,
        smsOptIn: true,
      }),
    };
    provider = {
      send: vi.fn().mockResolvedValue({ providerMessageId: 'provider-1', status: 'SENT' }),
    };
    dispatch = new SmsDispatchService(
      prisma,
      provider as any,
      phone,
      outbox,
      audit,
      collectionStatus as unknown as CollectionStatusService,
    );
    events = new EventsService(
      prisma,
      people as unknown as PeopleService,
      phone,
      templates,
      dispatch,
      collectionStatus as unknown as CollectionStatusService,
      outbox,
      audit,
    );
    sms = new SmsService(
      prisma,
      phone,
      dispatch,
      collectionStatus as unknown as CollectionStatusService,
      outbox,
      audit,
    );
  });

  it('sends once per supplier/date and suppresses duplicate events', async () => {
    const supplierId = '11111111-1111-4111-8111-111111111111';
    const dailyTotalId = uuidv7();
    const first = await events.ingestCollectionFinalized(finalizedEvent(supplierId, dailyTotalId));
    const second = await events.ingestCollectionFinalized(finalizedEvent(supplierId, dailyTotalId));

    expect(prisma.__tables.smsMessage).toHaveLength(1);
    expect(first?.status).toBe('SENT');
    expect(second?.id).toBe(first?.id);
    expect(provider.send).toHaveBeenCalledTimes(1);
    expect(collectionStatus.update).toHaveBeenCalledWith(
      dailyTotalId,
      'PENDING',
      expect.any(String),
      expect.any(String),
    );
    expect(collectionStatus.update).toHaveBeenCalledWith(dailyTotalId, 'SENT', expect.any(String));
    expect(JSON.stringify(prisma.__tables.smsMessage[0])).not.toContain('0771234567');
  });

  it('does not send when the supplier has no opted-in phone', async () => {
    people.getSupplier.mockResolvedValue({
      supplierId: '11111111-1111-4111-8111-111111111111',
      fullName: 'Supplier One',
      phonePrimary: '0771234567',
      smsOptIn: false,
    });
    const dailyTotalId = uuidv7();

    await expect(
      events.ingestCollectionFinalized(
        finalizedEvent('11111111-1111-4111-8111-111111111111', dailyTotalId),
      ),
    ).resolves.toBeNull();
    expect(prisma.__tables.smsMessage).toHaveLength(0);
    expect(collectionStatus.update).toHaveBeenCalledWith(
      dailyTotalId,
      'NOT_REQUIRED',
      undefined,
      expect.any(String),
    );
  });

  it('dead-letters a message after the retry budget is exhausted', async () => {
    provider.send.mockRejectedValue(new Error('provider offline'));
    process.env.SMS_MAX_ATTEMPTS = '1';

    await events.ingestCollectionFinalized(
      finalizedEvent('11111111-1111-4111-8111-111111111111', uuidv7()),
    );

    expect(prisma.__tables.smsMessage[0].status).toBe('FAILED');
    expect(prisma.__tables.smsDeadLetter).toHaveLength(1);
    expect(prisma.__tables.outboxEvent).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          envelope: expect.objectContaining({ type: 'sms.failed' }),
        }),
      ]),
    );
  });

  it('accepts signed delivery receipts and resends only failed messages', async () => {
    const message = await events.ingestCollectionFinalized(
      finalizedEvent('11111111-1111-4111-8111-111111111111', uuidv7()),
    );
    const webhooks = new WebhookService(
      prisma,
      outbox,
      audit,
      collectionStatus as unknown as CollectionStatusService,
    );
    const body = {
      provider: 'FAKE',
      providerMessageId: 'provider-1',
      status: 'DELIVERED',
    };
    const raw = Buffer.from(JSON.stringify(body));
    const signature = `sha256=${createHmac('sha256', 'webhook-secret').update(raw).digest('hex')}`;
    const req = {
      headers: { 'x-sms-signature': signature },
      rawBody: raw,
    } as any;

    await expect(webhooks.handle(req, body)).resolves.toEqual({ ok: true });
    expect(prisma.__tables.smsMessage[0].status).toBe('DELIVERED');

    await expect(sms.resend(message!.id)).rejects.toBeInstanceOf(ConflictError);

    prisma.__tables.smsMessage[0].status = 'FAILED';
    const resent = await sms.resend(message!.id);
    expect(resent.status).toBe('SENT');
    expect(prisma.__tables.smsMessage[0].attempts).toBe(1);
    expect(collectionStatus.update).toHaveBeenCalledWith(
      expect.any(String),
      'PENDING',
      message!.id,
      undefined,
    );
  });
});
