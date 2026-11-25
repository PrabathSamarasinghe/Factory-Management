import { createHmac } from 'node:crypto';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WebSocket } from 'ws';
import { HealthController } from '../src/health.controller';
import { AuditService } from '../src/audit/audit.service';
import { EventsController } from '../src/events/events.controller';
import { EventsService } from '../src/events/events.service';
import { canSubscribe } from '../src/events/channel-map';
import { sanitizePayload } from '../src/events/sanitize';
import { FcmService, isFcmConfigured, monitorRefreshMessage } from '../src/push/fcm.service';
import { PushController } from '../src/push/push.controller';
import { TicketsController } from '../src/tickets/tickets.controller';
import { TicketsService, isTicketValid, type TicketRecord } from '../src/tickets/tickets.service';
import { InboundWebhookController } from '../src/webhooks/inbound.controller';
import { WebhookSubscriptionsController } from '../src/webhooks/webhooks.controller';
import { WebhookService } from '../src/webhooks/webhooks.service';
import { signWebhookBody } from '../src/webhooks/crypto';
import { validateTargetUrl } from '../src/webhooks/url';
import {
  RealtimeGateway,
  normalizeUpgradePath,
  shouldDisconnectOnPermissionChange,
  subscribableChannels,
} from '../src/ws/realtime.gateway';
import { createFakePrisma } from './fake-prisma';

const NOW = new Date('2026-11-24T09:00:00.000Z');

const IDS = {
  principal: '11111111-1111-4111-8111-111111111111',
  eventA: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  eventB: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  eventC: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  eventD: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  eventE: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
  eventF: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
};

class FakeSocket {
  readonly sent: any[] = [];
  closed = false;

  send(payload: string): void {
    this.sent.push(JSON.parse(payload));
  }

  close(): void {
    this.closed = true;
  }

  on(): void {}
}

function request(permissions: string[] = [], headers: Record<string, any> = {}): any {
  return {
    headers: { 'x-permissions': JSON.stringify(permissions), ...headers },
    ip: '127.0.0.1',
  };
}

function event(
  type: string,
  id: string,
  payload: Record<string, unknown> = {},
  overrides: Record<string, unknown> = {},
): any {
  return {
    id,
    type,
    version: 1,
    occurredAt: NOW.toISOString(),
    producer: 'test-service',
    actor: { type: 'USER', id: IDS.principal },
    payload,
    ...overrides,
  };
}

function fakeFetch(responses: Array<{ status: number; body?: unknown }> = []) {
  const calls: Array<{ url: string; headers: Record<string, string>; body: string }> = [];
  const impl: any = async (url: any, init: any) => {
    calls.push({ url: String(url), headers: init.headers, body: init.body });
    const next = responses.shift() ?? { status: 200, body: {} };
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      json: async () => next.body ?? {},
    };
  };
  return { impl, calls };
}

function buildServices() {
  const prisma = createFakePrisma();
  const audit = new AuditService();
  let idCounter = 0;
  let ticketCounter = 0;
  const idFactory = () => `00000000-0000-4000-8000-${String(++idCounter).padStart(12, '0')}`;

  const tickets = new TicketsService(audit);
  tickets.clock = () => NOW;
  tickets.tokenFactory = () => `ticket-${++ticketCounter}`;

  const adapterHost = {
    httpAdapter: { getHttpServer: () => ({ on: () => {}, off: () => {} }) },
  } as any;
  const gateway = new RealtimeGateway(adapterHost, tickets, prisma as any, audit);
  gateway.clock = () => NOW;
  gateway.idFactory = idFactory;

  const webhooks = new WebhookService(prisma as any, audit);
  webhooks.clock = () => NOW;
  webhooks.idFactory = idFactory;
  webhooks.delay = async () => {};

  const push = new FcmService(prisma as any, audit);
  push.clock = () => NOW;
  push.idFactory = idFactory;

  const events = new EventsService(prisma as any, gateway, webhooks, push, audit);
  events.clock = () => NOW;
  events.idFactory = idFactory;

  return {
    prisma,
    audit,
    tickets,
    gateway,
    webhooks,
    push,
    events,
    ticketsController: new TicketsController(tickets),
    eventsController: new EventsController(events),
    webhooksController: new WebhookSubscriptionsController(webhooks),
    inboundController: new InboundWebhookController(webhooks),
    pushController: new PushController(push),
  };
}

async function seedEvent(
  prisma: any,
  id: string,
  channel: string,
  createdAt: Date,
  expiresAt: Date,
): Promise<void> {
  await prisma.realtimeEvent.create({
    data: {
      id,
      channel,
      eventType: 'trip.started',
      payload: { tripId: id },
      requiredPermission: 'monitor:read|trip:read',
      createdAt,
      expiresAt,
    },
  });
}

beforeAll(() => {
  process.env.NODE_ENV = 'test';
  process.env.PLATFORM_MASTER_KEY = Buffer.alloc(32, 7).toString('base64');
});

beforeEach(() => {
  delete process.env.REALTIME_INGEST_TOKEN;
  delete process.env.FCM_PROJECT_ID;
  delete process.env.FCM_SERVICE_ACCOUNT_JSON;
  delete process.env.SMS_WEBHOOK_SECRET;
  delete process.env.WEBHOOK_INBOUND_SECRET;
});

describe('realtime-service', () => {
  it('reports health and wraps the response in data', () => {
    expect(new HealthController().health()).toEqual({
      data: { status: 'ok', service: 'realtime-service' },
    });
  });

  it('allows monitor:read for trips, weighing, and monitor channels', () => {
    for (const channel of ['trips.live', 'weighing.live', 'monitor.today']) {
      expect(canSubscribe(['monitor:read'], channel)).toBe(true);
    }
    expect(canSubscribe(['monitor:read'], 'accounts.updates')).toBe(false);
  });

  it('requires audit:read for admin.audit', () => {
    expect(canSubscribe(['audit:read'], 'admin.audit')).toBe(true);
    expect(canSubscribe(['monitor:read'], 'admin.audit')).toBe(false);
    expect(canSubscribe(['audit:read'], 'trips.live')).toBe(false);
  });

  it('filters channels with ticket scope and permissions', () => {
    expect(
      subscribableChannels(
        ['monitor:read'],
        ['trips.live', 'accounts.updates'],
        ['trips.live', 'accounts.updates'],
      ),
    ).toEqual({ allowed: ['trips.live'], denied: ['accounts.updates'] });
  });

  it('requires an authenticated principal to issue a ticket', () => {
    const { ticketsController } = buildServices();
    expect(() => ticketsController.issue(request(), {})).toThrow(/authenticated/);
  });

  it('expires tickets after 30 seconds', () => {
    const { tickets } = buildServices();
    const issued = tickets.issue({
      principalId: IDS.principal,
      permissions: ['monitor:read'],
      channels: ['monitor.today'],
    });
    const record = {
      token: issued.ticket,
      principalId: IDS.principal,
      clientApp: 'unknown',
      permissions: ['monitor:read'],
      channels: ['monitor.today'],
      createdAt: NOW,
      expiresAt: new Date(issued.expiresAt),
    } as TicketRecord;

    expect(isTicketValid(record, NOW)).toBe(true);
    expect(isTicketValid(record, new Date(NOW.getTime() + 30_000))).toBe(false);
  });

  it('makes tickets one-time', () => {
    const { tickets, ticketsController } = buildServices();
    const response = ticketsController.issue(
      request(['monitor:read'], { 'x-user-id': IDS.principal }),
      { channels: ['monitor.today'] },
    );
    const token = (response.data as any).ticket;
    expect(tickets.consume(token, NOW)).not.toBeNull();
    expect(tickets.consume(token, NOW)).toBeNull();
  });

  it('stores a permission snapshot and rejects unauthorized ticket channels', () => {
    const { tickets } = buildServices();
    const issued = tickets.issue({
      principalId: IDS.principal,
      clientApp: 'desktop-monitor',
      permissions: ['monitor:read'],
      channels: ['trips.live', 'monitor.today'],
    });
    expect(issued.channels).toEqual(['trips.live', 'monitor.today']);
    expect(() =>
      tickets.issue({
        principalId: IDS.principal,
        permissions: ['monitor:read'],
        channels: ['accounts.updates'],
      }),
    ).toThrow(/Not authorized/);
  });

  it('acks subscriptions and records the connection registry', async () => {
    const { tickets, gateway, prisma } = buildServices();
    const issued = tickets.issue({
      principalId: IDS.principal,
      clientApp: 'desktop-monitor',
      permissions: ['monitor:read'],
      channels: ['trips.live', 'monitor.today'],
    });
    const ticket = tickets.consume(issued.ticket, NOW)!;
    const socket = new FakeSocket();
    gateway.attachSocket(socket as unknown as WebSocket, ticket);

    const result = gateway.handleSubscribe(socket as unknown as WebSocket, [
      'trips.live',
      'accounts.updates',
    ]);
    expect(result).toEqual({ subscribed: ['trips.live'], denied: ['accounts.updates'] });
    expect(socket.sent[0].code).toBe('CHANNEL_DENIED');
    expect(socket.sent[1]).toEqual({ type: 'subscribed', channels: ['trips.live'] });
    expect(prisma.__stores.realtimeConnection[0].principalId).toBe(IDS.principal);
    expect(prisma.__stores.realtimeConnection[0].channels).toEqual(['trips.live']);
  });

  it('denies a channel that is not in the ticket', () => {
    const { tickets, gateway } = buildServices();
    const issued = tickets.issue({
      principalId: IDS.principal,
      permissions: ['monitor:read'],
      channels: ['monitor.today'],
    });
    const socket = new FakeSocket();
    gateway.attachSocket(socket as unknown as WebSocket, tickets.consume(issued.ticket, NOW)!);
    const result = gateway.handleSubscribe(socket as unknown as WebSocket, ['trips.live']);
    expect(result.denied).toEqual(['trips.live']);
  });

  it('re-filters sockets when permissions change', () => {
    const { tickets, gateway } = buildServices();
    const issued = tickets.issue({
      principalId: IDS.principal,
      permissions: ['monitor:read'],
      channels: ['trips.live', 'weighing.live', 'monitor.today'],
    });
    const socket = new FakeSocket();
    const ws = socket as unknown as WebSocket;
    gateway.attachSocket(ws, tickets.consume(issued.ticket, NOW)!);
    gateway.handleSubscribe(ws, ['trips.live', 'weighing.live', 'monitor.today']);
    expect(gateway.stateFor(ws)?.channels).toHaveLength(3);

    expect(gateway.applyPermissionChange(IDS.principal, ['trip:read'])).toBe(1);
    expect(gateway.stateFor(ws)?.channels).toEqual(['trips.live']);
    expect(socket.sent.at(-1)).toEqual({ type: 'permission_changed', channels: ['trips.live'] });
    expect(socket.closed).toBe(false);
  });

  it('disconnects sockets with no remaining authorized channels', () => {
    const { tickets, gateway, prisma } = buildServices();
    const issued = tickets.issue({
      principalId: IDS.principal,
      permissions: ['monitor:read'],
      channels: ['monitor.today'],
    });
    const socket = new FakeSocket();
    const ws = socket as unknown as WebSocket;
    gateway.attachSocket(ws, tickets.consume(issued.ticket, NOW)!);
    gateway.handleSubscribe(ws, ['monitor.today']);

    expect(shouldDisconnectOnPermissionChange([], ['monitor.today'])).toBe(true);
    gateway.applyPermissionChange(IDS.principal, []);
    expect(socket.closed).toBe(true);
    expect(prisma.__stores.realtimeConnection[0].disconnectedAt).toEqual(NOW);
  });

  it('normalizes proxied WebSocket upgrade paths', () => {
    expect(normalizeUpgradePath('/connect?ticket=one')).toBe('/connect');
    expect(normalizeUpgradePath('/ws/connect?ticket=one')).toBe('/connect');
    expect(normalizeUpgradePath('/realtime/connect?ticket=one')).toBe('/connect');
    expect(normalizeUpgradePath('/connect/?ticket=one')).toBe('/connect');
    expect(normalizeUpgradePath('/socket')).toBeNull();
  });

  it('maps trip events to trips.live with both permissions', async () => {
    const { events, prisma } = buildServices();
    const result = await events.ingest(event('trip.started', IDS.eventA, { tripId: 'trip-1' }));
    expect(result.channels).toEqual(['trips.live']);
    expect(prisma.__stores.realtimeEvent[0].requiredPermission).toBe('monitor:read|trip:read');
  });

  it('maps collection.finalized to weighing and monitor channels', async () => {
    const { events, prisma } = buildServices();
    const result = await events.ingest(event('collection.finalized', IDS.eventB, { kg: '12.500' }));
    expect(result.channels).toEqual(['weighing.live', 'monitor.today']);
    expect(prisma.__stores.realtimeEvent.map((row: any) => row.channel)).toEqual([
      'weighing.live',
      'monitor.today',
    ]);
  });

  it('strips phone and body fields from sms status events', async () => {
    const { events, prisma } = buildServices();
    await events.ingest(
      event('sms.delivered', IDS.eventC, {
        status: 'DELIVERED',
        phone: '+94770000000',
        body: 'private sms body',
        recipient: '0770000000',
        accountNumber: '1234567890',
      }),
    );
    const payload = prisma.__stores.realtimeEvent[0].payload;
    expect(payload.status).toBe('DELIVERED');
    expect(payload).not.toHaveProperty('phone');
    expect(payload).not.toHaveProperty('body');
    expect(payload).not.toHaveProperty('recipient');
    expect(payload).not.toHaveProperty('accountNumber');
  });

  it('sanitizes nested payload values without mutating the input', () => {
    const input = { status: 'OK', nested: { phone: '077', approval: true } };
    expect(sanitizePayload(input)).toEqual({ status: 'OK', nested: { approval: true } });
    expect(input.nested.phone).toBe('077');
  });

  it('ignores unknown events but records them as processed', async () => {
    const { events, prisma } = buildServices();
    const result = await events.ingest(event('unknown.event', IDS.eventD));
    expect(result.status).toBe('processed');
    expect(result.channels).toEqual([]);
    expect(prisma.__stores.realtimeEvent).toHaveLength(0);
    expect(prisma.__stores.processedEvent).toHaveLength(1);
  });

  it('rejects invalid UUIDs and unsupported versions', async () => {
    const { events } = buildServices();
    await expect(events.ingest(event('trip.started', 'not-a-uuid'))).rejects.toThrow(/UUID/);
    await expect(
      events.ingest(event('trip.started', IDS.eventA, {}, { version: 2 })),
    ).rejects.toThrow(/version 1/);
  });

  it('deduplicates ingested events by consumer and event id', async () => {
    const { events, prisma } = buildServices();
    const first = await events.ingest(event('trip.started', IDS.eventA));
    const second = await events.ingest(event('trip.started', IDS.eventA));
    expect(first.status).toBe('processed');
    expect(second.status).toBe('duplicate');
    expect(prisma.__stores.realtimeEvent).toHaveLength(1);
    expect(prisma.__stores.processedEvent).toHaveLength(1);
    expect(prisma.__stores.processedEvent[0].consumer).toBe('realtime-service');
  });

  it('returns catch-up events in createdAt order after a cursor', async () => {
    const { events, prisma } = buildServices();
    await seedEvent(
      prisma,
      IDS.eventA,
      'trips.live',
      new Date(NOW.getTime() - 120_000),
      new Date(NOW.getTime() + 3_600_000),
    );
    await seedEvent(
      prisma,
      IDS.eventB,
      'trips.live',
      new Date(NOW.getTime() - 60_000),
      new Date(NOW.getTime() + 3_600_000),
    );
    const rows = await events.catchUp({
      channel: 'trips.live',
      afterId: IDS.eventA,
      permissions: ['monitor:read'],
    });
    expect(rows.map((row: any) => row.id)).toEqual([IDS.eventB]);
  });

  it('excludes expired events from catch-up', async () => {
    const { events, prisma } = buildServices();
    await seedEvent(
      prisma,
      IDS.eventC,
      'trips.live',
      new Date(NOW.getTime() - 7_200_000),
      new Date(NOW.getTime() - 3_600_000),
    );
    await seedEvent(
      prisma,
      IDS.eventB,
      'trips.live',
      new Date(NOW.getTime() - 60_000),
      new Date(NOW.getTime() + 3_600_000),
    );
    const rows = await events.catchUp({ channel: 'trips.live', permissions: ['trip:read'] });
    expect(rows.map((row: any) => row.id)).toEqual([IDS.eventB]);
  });

  it('falls back to a timestamp cursor when afterId is not found', async () => {
    const { events, prisma } = buildServices();
    await seedEvent(
      prisma,
      IDS.eventA,
      'trips.live',
      new Date(NOW.getTime() - 60_000),
      new Date(NOW.getTime() + 3_600_000),
    );
    await seedEvent(
      prisma,
      IDS.eventB,
      'trips.live',
      new Date(NOW.getTime() - 30_000),
      new Date(NOW.getTime() + 3_600_000),
    );
    const rows = await events.catchUp({
      channel: 'trips.live',
      afterId: new Date(NOW.getTime() - 60_000).toISOString(),
      permissions: ['monitor:read'],
    });
    expect(rows.map((row: any) => row.id)).toEqual([IDS.eventB]);
  });

  it('denies catch-up without a channel permission', async () => {
    const { events } = buildServices();
    await expect(
      events.catchUp({ channel: 'accounts.updates', permissions: ['monitor:read'] }),
    ).rejects.toThrow(/Not authorized/);
  });

  it('requires the ingest service token when configured', async () => {
    const { eventsController } = buildServices();
    process.env.REALTIME_INGEST_TOKEN = 'ingest-secret';
    await expect(
      eventsController.ingest(
        request([], { 'x-service-token': 'wrong' }),
        event('trip.started', IDS.eventA),
      ),
    ).rejects.toThrow(/Invalid service token/);
    const result = await eventsController.ingest(
      request([], { 'x-service-token': 'ingest-secret' }),
      event('trip.started', IDS.eventA),
    );
    expect((result.data as any).status).toBe('processed');
  });

  it('manages webhook subscriptions with webhook:manage', async () => {
    const { webhooksController } = buildServices();
    expect(() => webhooksController.list(request())).toThrow(/webhook:manage/);
    const admin = request(['webhook:manage'], { 'x-user-id': IDS.principal });
    const created = await webhooksController.create(admin, {
      name: 'ERP sink',
      targetUrl: 'https://example.com/hooks',
      eventTypes: ['payment.paid'],
      secret: 'subscription-secret',
    });
    const id = (created.data as any).id;
    expect((await webhooksController.list(admin)).data).toHaveLength(1);
    const updated = await webhooksController.update(admin, id, { active: false });
    expect((updated.data as any).active).toBe(false);
    const removed = await webhooksController.remove(admin, id);
    expect((removed.data as any).deleted).toBe(true);
  });

  it('encrypts webhook secrets and returns only a masked hint', async () => {
    const { webhooks, prisma } = buildServices();
    const created: any = await webhooks.create({
      name: 'Ledger sink',
      targetUrl: 'https://example.com/hooks',
      eventTypes: ['*'],
      secret: 'abcdef123456',
    });
    expect(created.secretHint).toBe('****3456');
    expect(created).not.toHaveProperty('secret');
    expect(created).not.toHaveProperty('secretEnc');
    const stored = prisma.__stores.webhookSubscription[0].secretEnc;
    expect(Buffer.isBuffer(stored)).toBe(true);
    expect(stored.toString('utf8')).not.toContain('abcdef123456');
  });

  it('rejects SSRF targets and accepts public HTTPS URLs', async () => {
    expect(validateTargetUrl('https://example.com/hook')).toBe('https://example.com/hook');
    expect(validateTargetUrl('http://localhost:3001/hook')).toBe('http://localhost:3001/hook');
    expect(() => validateTargetUrl('http://169.254.169.254/latest')).toThrow(/HTTPS/);
    expect(() => validateTargetUrl('https://10.0.0.5/hook')).toThrow(/private/);
    expect(() => validateTargetUrl('https://api.internal/hook')).toThrow(/private/);
    expect(() => validateTargetUrl('https://localhost/hook')).toThrow(/private/);
  });

  it('signs outbound webhooks and retries with delivery logs', async () => {
    const { webhooks, prisma } = buildServices();
    await webhooks.create({
      name: 'Retry sink',
      targetUrl: 'https://example.com/hooks',
      eventTypes: ['*'],
      secret: 'retry-secret',
    });
    const fetchMock = fakeFetch([{ status: 500 }, { status: 503 }, { status: 200 }]);
    webhooks.fetchImpl = fetchMock.impl;

    const deliveries = await webhooks.dispatch({
      eventId: IDS.eventA,
      eventType: 'payment.paid',
      channels: ['accounts.updates'],
      payload: { status: 'PAID' },
    });
    expect(deliveries.map((row) => row.attempt)).toEqual([1, 2, 3]);
    expect(deliveries.map((row) => row.status)).toEqual(['FAILED', 'FAILED', 'DELIVERED']);
    expect(fetchMock.calls).toHaveLength(3);

    const first = fetchMock.calls[0];
    const expected = createHmac('sha256', 'retry-secret')
      .update(`${first.headers['x-galatura-timestamp']}.${first.body}`)
      .digest('hex');
    expect(first.headers['x-galatura-signature']).toBe(`sha256=${expected}`);
    expect(first.body).not.toContain('retry-secret');
    expect(prisma.__stores.webhookDelivery).toHaveLength(3);
    expect(prisma.__stores.webhookDelivery[2].deliveredAt).toEqual(NOW);
  });

  it('verifies inbound provider signatures and deduplicates receipts', async () => {
    const { webhooks, inboundController, prisma } = buildServices();
    process.env.SMS_WEBHOOK_SECRET = 'provider-secret';
    const rawBody = '{"id":"sms-1","status":"DELIVERED"}';
    const timestamp = '1763971200';
    const signature = signWebhookBody('provider-secret', timestamp, rawBody);
    const req = request([], {
      'x-galatura-timestamp': timestamp,
      'x-galatura-signature': signature,
    });
    req.rawBody = rawBody;

    const result = await inboundController.handle(req, 'sms', JSON.parse(rawBody));
    expect(result).toEqual({ data: { status: 'accepted' } });
    await inboundController.handle(req, 'sms', JSON.parse(rawBody));
    expect(prisma.__stores.processedEvent).toHaveLength(1);

    const badReq = request([], {
      'x-galatura-timestamp': timestamp,
      'x-galatura-signature': 'sha256=deadbeef',
    });
    badReq.rawBody = rawBody;
    await expect(inboundController.handle(badReq, 'sms', {})).rejects.toThrow(
      /Invalid webhook signature/,
    );
  });

  it('skips FCM sends when credentials are absent', async () => {
    const { push, pushController } = buildServices();
    expect(isFcmConfigured()).toBe(false);
    expect(await push.test(IDS.principal)).toEqual({ status: 'skipped' });
    const result = await pushController.test(
      request(['monitor:read'], { 'x-user-id': IDS.principal }),
    );
    expect((result.data as any).status).toBe('skipped');
  });

  it('keeps FCM payloads generic with only a refresh data field', () => {
    const message: any = monitorRefreshMessage('fcm-token');
    expect(message.message.data).toEqual({ kind: 'monitor.refresh' });
    expect(message.message.notification.title).toBe('Factory update');
    expect(message.message.notification.body).toBe('New monitor information is available.');
    expect(JSON.stringify(message)).not.toMatch(/amount|phone|077|account/i);
  });

  it('registers and deactivates push tokens', async () => {
    const { push } = buildServices();
    const created: any = await push.registerToken({
      principalId: IDS.principal,
      token: 'abcdefghijklmnop',
      platform: 'ANDROID',
    });
    expect(created.tokenHint).toBe('abcd****mnop');
    expect(created.active).toBe(true);

    const deactivated: any = await push.registerToken({
      principalId: IDS.principal,
      token: 'abcdefghijklmnop',
      platform: 'ANDROID',
      active: false,
    });
    expect(deactivated.active).toBe(false);
  });

  it('calls monitor refresh push for monitor.today events', async () => {
    const { events, push } = buildServices();
    const notify = vi.spyOn(push, 'notifyMonitorRefresh').mockResolvedValue({ status: 'skipped' });
    await events.ingest(event('attendance.day.closed', IDS.eventE, { present: 42 }));
    expect(notify).toHaveBeenCalledWith([IDS.principal]);
  });

  it('refreshes socket permissions when a permissions.changed event is ingested', async () => {
    const { events, gateway } = buildServices();
    const spy = vi.spyOn(gateway, 'applyPermissionChange').mockReturnValue(0);
    await events.ingest(
      event('permissions.changed', IDS.eventF, {
        principalId: IDS.principal,
        permissions: ['trip:read'],
      }),
    );
    expect(spy).toHaveBeenCalledWith(IDS.principal, ['trip:read']);
  });

  it('records sanitized audit entries for ingest and connections', async () => {
    const { events, tickets, gateway, audit } = buildServices();
    await events.ingest(event('trip.started', IDS.eventA, { secret: 'hidden-value' }));
    const issued = tickets.issue({
      principalId: IDS.principal,
      permissions: ['monitor:read'],
      channels: ['trips.live'],
    });
    gateway.attachSocket(
      new FakeSocket() as unknown as WebSocket,
      tickets.consume(issued.ticket, NOW)!,
    );

    const actions = audit.entries.map((entry) => entry.action);
    expect(actions).toContain('event.ingested');
    expect(actions).toContain('connection.opened');
    expect(JSON.stringify(audit.entries)).not.toContain('hidden-value');
  });
});
