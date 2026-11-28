import { beforeEach, describe, expect, it } from 'vitest';
import { ForbiddenError, createEvent } from '@galatura/platform-kit';
import { EventsService } from '../src/events/events.service';
import { EventsController } from '../src/events/events.controller';
import { MonitorService } from '../src/monitor/monitor.service';
import { MonitorController } from '../src/monitor/monitor.controller';
import { HealthController } from '../src/health.controller';
import { OutboxService } from '../src/outbox/outbox.service';
import { createFakePrisma } from './fake-prisma';

const DAY = '2026-11-20';
const AT = `${DAY}T10:00:00.000Z`;
const LATER = `${DAY}T12:00:00.000Z`;

function id(sequence: number): string {
  return `00000000-0000-4000-8000-${sequence.toString(16).padStart(12, '0')}`;
}

const IDS = {
  event: id(1),
  secondEvent: id(2),
  supplier: id(3),
  supplierTwo: id(4),
  person: id(5),
  trip: id(6),
  route: id(7),
  lorry: id(8),
  newRoute: id(9),
  newLorry: id(10),
  message: id(11),
};

function makeEvent(
  type: string,
  payload: unknown,
  eventId = IDS.event,
  occurredAt = AT,
  version = 1,
) {
  return {
    ...createEvent({
      type,
      payload,
      actor: { type: 'SERVICE' as const, id: 'reporting-service' },
      producer: 'test-service',
      occurredAt: new Date(occurredAt),
    }),
    id: eventId,
    version,
  };
}

function request(permissions: string[] = [], headers: Record<string, string> = {}): any {
  return {
    headers: { 'x-permissions': JSON.stringify(permissions), ...headers },
    ip: '127.0.0.1',
  };
}

async function unwrap(result: { data: any } | Promise<{ data: any }>): Promise<any> {
  return (await result).data;
}

function buildServices() {
  const prisma = createFakePrisma({
    processedEvent: [],
    ingestAudit: [],
    rptDailySummary: [],
    rptTripLive: [],
    rptSupplierDaily: [],
    rptFinanceSnapshot: [
      {
        id: 'finance-current',
        cashIn: '0.00',
        cashOut: '0.00',
        payables: '0.00',
        journalPostedTotal: '0.00',
        payrollApprovedTotal: '0.00',
        paymentPaidTotal: '0.00',
        sourceEventIds: [],
        updatedAt: new Date(AT),
      },
    ],
    rptInventorySnapshot: [
      {
        id: 'inventory-current',
        purchaseQty: '0.000',
        purchaseValue: '0.00',
        issueQty: '0.000',
        issueValue: '0.00',
        receiptCount: 0,
        issueCount: 0,
        sourceEventIds: [],
        updatedAt: new Date(AT),
      },
    ],
  });
  const events = new EventsService(prisma as any);
  const monitor = new MonitorService(prisma as any);
  return {
    prisma,
    events,
    monitor,
    eventsController: new EventsController(events),
    monitorController: new MonitorController(monitor),
  };
}

function dayKey(value: unknown): string {
  return new Date(value as string).toISOString().slice(0, 10);
}

function dailyRow(prisma: any, date = DAY): any {
  return prisma.__stores.rptDailySummary.find((row: any) => dayKey(row.date) === date);
}

function supplierRow(prisma: any, supplierId = IDS.supplier, date = DAY): any {
  return prisma.__stores.rptSupplierDaily.find(
    (row: any) => row.supplierId === supplierId && dayKey(row.date) === date,
  );
}

function financeRow(prisma: any): any {
  return prisma.__stores.rptFinanceSnapshot.find((row: any) => row.id === 'finance-current');
}

function inventoryRow(prisma: any): any {
  return prisma.__stores.rptInventorySnapshot.find((row: any) => row.id === 'inventory-current');
}

function collectionPayload() {
  return {
    dailyTotalId: id(50),
    tripId: IDS.trip,
    supplierId: IDS.supplier,
    collectionDate: DAY,
    totalNetKg: '12.345',
    totalBags: 7,
    finalizedAt: AT,
    finalizedBy: IDS.person,
  };
}

function attendancePayload(status: string, workedMinutes: number) {
  return {
    personId: IDS.person,
    workDate: DAY,
    status,
    workedMinutes,
    lateMinutes: status === 'LATE' ? 15 : 0,
    earlyLeaveMinutes: 0,
    overtimeMinutes: 0,
  };
}

beforeEach(() => {
  process.env.REPORTING_INGEST_TOKEN = 'ingest-token';
});

describe('reporting-service event consumption', () => {
  it('wraps health responses and keeps the reporting producer label', async () => {
    expect(await unwrap(new HealthController().health())).toEqual({
      status: 'ok',
      service: 'reporting-service',
    });
    const event = await new OutboxService().append('reporting.test', {}, { type: 'SERVICE' });
    expect(event.producer).toBe('reporting-service');
  });

  it('accepts monitor permission or a service token on ingest', async () => {
    const services = buildServices();
    const event = makeEvent('account.created', {}, IDS.event);
    await expect(unwrap(services.eventsController.ingest(request(), event))).rejects.toThrow(
      /Missing one of the required permissions/,
    );
    expect(
      (await unwrap(services.eventsController.ingest(request(['monitor:read']), event))).status,
    ).toBe('ignored');

    const tokenServices = buildServices();
    const result = await unwrap(
      tokenServices.eventsController.ingest(
        request([], { 'x-service-token': 'ingest-token' }),
        makeEvent('account.created', {}, IDS.secondEvent),
      ),
    );
    expect(result.status).toBe('ignored');
  });

  it('rejects an invalid service token without monitor permission', async () => {
    const { eventsController } = buildServices();
    await expect(
      unwrap(
        eventsController.ingest(
          request([], { 'x-service-token': 'wrong-token' }),
          makeEvent('account.created', {}),
        ),
      ),
    ).rejects.toThrow(/Missing one of the required permissions/);
  });

  it('rejects non-UUID event ids', async () => {
    const { events } = buildServices();
    await expect(events.ingest(makeEvent('account.created', {}, 'not-a-uuid'))).rejects.toThrow(
      /event.id must be a UUID/,
    );
  });

  it('rejects event versions other than 1', async () => {
    const { events } = buildServices();
    await expect(events.ingest(makeEvent('account.created', {}, IDS.event, AT, 2))).rejects.toThrow(
      /Only event version 1 is supported/,
    );
  });

  it('ignores unsupported events but still marks them processed', async () => {
    const { events, prisma } = buildServices();
    const result = await events.ingest(makeEvent('unknown.event', {}));
    expect(result).toEqual({ status: 'ignored', eventId: IDS.event, type: 'unknown.event' });
    expect(prisma.__stores.processedEvent).toHaveLength(1);
    expect(prisma.__stores.processedEvent[0]).toMatchObject({
      id: IDS.event,
      consumer: 'reporting-service',
      type: 'unknown.event',
    });
    expect(prisma.__stores.ingestAudit[0].status).toBe('ignored');
  });

  it('returns duplicate for replayed event ids without applying projections twice', async () => {
    const { events, prisma } = buildServices();
    const event = makeEvent('collection.finalized', collectionPayload(), IDS.event);
    expect((await events.ingest(event)).status).toBe('processed');
    const replay = await events.ingest(event);
    expect(replay).toEqual({
      status: 'duplicate',
      eventId: IDS.event,
      type: 'collection.finalized',
    });
    expect(dailyRow(prisma).kgCollected).toBe('12.345');
    expect(prisma.__stores.processedEvent).toHaveLength(1);
    expect(prisma.__stores.ingestAudit).toHaveLength(1);
  });

  it('projects collection.finalized into daily and supplier rows', async () => {
    const { events, prisma } = buildServices();
    const result = await events.ingest(makeEvent('collection.finalized', collectionPayload()));
    expect(result.status).toBe('processed');
    expect(dailyRow(prisma).kgCollected).toBe('12.345');
    expect(dailyRow(prisma).kgWeighed).toBe('12.345');
    const supplier = supplierRow(prisma);
    expect(supplier.collectionKg).toBe('12.345');
    expect(supplier.collectionBags).toBe(7);
  });

  it('stores source event ids on every projection row it changes', async () => {
    const { events, prisma } = buildServices();
    await events.ingest(makeEvent('collection.finalized', collectionPayload()));
    const source = [{ id: IDS.event, type: 'collection.finalized', occurredAt: AT }];
    expect(dailyRow(prisma).sourceEventIds).toEqual(source);
    expect(supplierRow(prisma).sourceEventIds).toEqual(source);
  });

  it('caps source event id arrays at 50 entries', async () => {
    const { events, prisma } = buildServices();
    for (let sequence = 100; sequence < 155; sequence += 1) {
      await events.ingest(makeEvent('sms.queued', { messageId: id(sequence) }, id(sequence)));
    }
    const sources = dailyRow(prisma).sourceEventIds;
    expect(sources).toHaveLength(50);
    expect(sources[0].id).toBe(id(105));
    expect(sources[49].id).toBe(id(154));
  });

  it('counts PRESENT attendance', async () => {
    const { events, prisma } = buildServices();
    await events.ingest(
      makeEvent('attendance.day.closed', attendancePayload('PRESENT', 480), id(20)),
    );
    expect(dailyRow(prisma)).toMatchObject({
      attendancePresent: 1,
      attendanceLate: 0,
      attendanceAbsent: 0,
    });
  });

  it('counts LATE attendance as present and late', async () => {
    const { events, prisma } = buildServices();
    await events.ingest(makeEvent('attendance.day.closed', attendancePayload('LATE', 420), id(21)));
    expect(dailyRow(prisma)).toMatchObject({
      attendancePresent: 1,
      attendanceLate: 1,
      attendanceAbsent: 0,
    });
  });

  it('counts ABSENT attendance', async () => {
    const { events, prisma } = buildServices();
    await events.ingest(makeEvent('attendance.day.closed', attendancePayload('ABSENT', 0), id(22)));
    expect(dailyRow(prisma)).toMatchObject({
      attendancePresent: 0,
      attendanceLate: 0,
      attendanceAbsent: 1,
    });
  });

  it('counts other attendance statuses as present only when worked minutes exist', async () => {
    const { events, prisma } = buildServices();
    await events.ingest(makeEvent('attendance.day.closed', attendancePayload('LEAVE', 0), id(23)));
    await events.ingest(
      makeEvent('attendance.day.closed', attendancePayload('INCOMPLETE', 120), id(24)),
    );
    expect(dailyRow(prisma)).toMatchObject({
      attendancePresent: 1,
      attendanceLate: 0,
      attendanceAbsent: 0,
    });
  });

  it('upserts a live trip from trip.started', async () => {
    const { events, prisma } = buildServices();
    await events.ingest(
      makeEvent(
        'trip.started',
        { tripId: IDS.trip, routeId: IDS.route, lorryId: IDS.lorry, startedAt: AT },
        id(25),
      ),
    );
    const trip = prisma.__stores.rptTripLive.find((row: any) => row.tripId === IDS.trip);
    expect(trip).toMatchObject({
      routeId: IDS.route,
      lorryId: IDS.lorry,
      status: 'STARTED',
      lastEventId: id(25),
    });
    expect(trip.startedAt.toISOString()).toBe(AT);
    expect(dailyRow(prisma).tripsStarted).toBe(1);
  });

  it('upserts trip.ended while retaining startedAt', async () => {
    const { events, prisma } = buildServices();
    await events.ingest(
      makeEvent(
        'trip.started',
        { tripId: IDS.trip, routeId: IDS.route, lorryId: IDS.lorry, startedAt: AT },
        id(26),
      ),
    );
    await events.ingest(
      makeEvent('trip.ended', { tripId: IDS.trip, endedAt: LATER }, id(27), LATER),
    );
    const trip = prisma.__stores.rptTripLive.find((row: any) => row.tripId === IDS.trip);
    expect(trip.status).toBe('ENDED');
    expect(trip.startedAt.toISOString()).toBe(AT);
    expect(trip.endedAt.toISOString()).toBe(LATER);
    expect(trip.lastEventId).toBe(id(27));
    expect(dailyRow(prisma)).toMatchObject({ tripsStarted: 1, tripsEnded: 1 });
  });

  it('updates route and lorry from assignment.changed on an existing trip', async () => {
    const { events, prisma } = buildServices();
    await events.ingest(
      makeEvent(
        'trip.started',
        { tripId: IDS.trip, routeId: IDS.route, lorryId: IDS.lorry, startedAt: AT },
        id(28),
      ),
    );
    await events.ingest(
      makeEvent(
        'assignment.changed',
        {
          assignmentId: id(60),
          tripId: IDS.trip,
          routeId: IDS.newRoute,
          lorryId: IDS.newLorry,
        },
        id(29),
      ),
    );
    const trip = prisma.__stores.rptTripLive.find((row: any) => row.tripId === IDS.trip);
    expect(trip).toMatchObject({
      routeId: IDS.newRoute,
      lorryId: IDS.newLorry,
      status: 'STARTED',
      lastEventId: id(29),
    });
  });

  it('ignores assignment.changed without a trip id or matching trip row', async () => {
    const { events, prisma } = buildServices();
    await expect(
      events.ingest(
        makeEvent(
          'assignment.changed',
          { assignmentId: id(61), routeId: IDS.newRoute, lorryId: IDS.newLorry },
          id(30),
        ),
      ),
    ).resolves.toMatchObject({ status: 'processed' });
    await events.ingest(
      makeEvent(
        'assignment.changed',
        { tripId: id(999), routeId: IDS.newRoute, lorryId: IDS.newLorry },
        id(31),
      ),
    );
    expect(prisma.__stores.rptTripLive).toHaveLength(0);
  });

  it('increments all four SMS counters from event types', async () => {
    const { events, prisma } = buildServices();
    const types = ['sms.queued', 'sms.sent', 'sms.delivered', 'sms.failed'];
    for (const [index, type] of types.entries()) {
      await events.ingest(makeEvent(type, { messageId: id(40 + index) }, id(40 + index)));
    }
    expect(dailyRow(prisma)).toMatchObject({
      smsQueued: 1,
      smsSent: 1,
      smsDelivered: 1,
      smsFailed: 1,
    });
  });

  it('projects supplier payments into finance, supplier, and daily totals', async () => {
    const { events, prisma } = buildServices();
    financeRow(prisma).payables = '1000.00';
    await events.ingest(
      makeEvent(
        'payment.paid',
        {
          paymentId: id(62),
          amount: '125.50',
          paidDate: LATER,
          payeeType: 'SUPPLIER',
          payeeId: IDS.supplier,
        },
        id(32),
      ),
    );
    expect(financeRow(prisma)).toMatchObject({
      cashOut: '125.50',
      payables: '874.50',
      paymentPaidTotal: '125.50',
    });
    expect(supplierRow(prisma).paidAmount).toBe('125.50');
    expect(dailyRow(prisma).suppliersPaidDecimal).toBe('125.50');
  });

  it('does not create supplier rows for non-supplier payments', async () => {
    const { events, prisma } = buildServices();
    await events.ingest(
      makeEvent(
        'payment.paid',
        {
          paymentId: id(63),
          amount: '40.00',
          paidDate: LATER,
          payeeType: 'EMPLOYEE',
          payeeId: id(64),
        },
        id(33),
      ),
    );
    expect(financeRow(prisma).cashOut).toBe('40.00');
    expect(prisma.__stores.rptSupplierDaily).toHaveLength(0);
    expect(dailyRow(prisma)).toBeUndefined();
  });

  it('uses netTotal for payroll.approved', async () => {
    const { events, prisma } = buildServices();
    await events.ingest(
      makeEvent(
        'payroll.approved',
        { payrollRunId: id(65), netTotal: '500.00', grossTotal: '600.00' },
        id(34),
      ),
    );
    expect(financeRow(prisma)).toMatchObject({
      cashOut: '500.00',
      payrollApprovedTotal: '500.00',
    });
  });

  it('falls back to grossTotal for payroll.approved', async () => {
    const { events, prisma } = buildServices();
    await events.ingest(
      makeEvent('payroll.approved', { payrollRunId: id(66), grossTotal: '600.00' }, id(35)),
    );
    expect(financeRow(prisma)).toMatchObject({
      cashOut: '600.00',
      payrollApprovedTotal: '600.00',
    });
  });

  it('adds collection journals to cashIn and journalPostedTotal', async () => {
    const { events, prisma } = buildServices();
    await events.ingest(
      makeEvent(
        'journal.posted',
        { debitTotal: '200.00', creditTotal: '200.00', sourceType: 'COLLECTION' },
        id(36),
      ),
    );
    expect(financeRow(prisma)).toMatchObject({
      cashIn: '200.00',
      journalPostedTotal: '200.00',
    });
  });

  it('adds non-collection journals only to journalPostedTotal', async () => {
    const { events, prisma } = buildServices();
    await events.ingest(
      makeEvent(
        'journal.posted',
        { debitTotal: '200.00', creditTotal: '200.00', sourceType: 'PAYROLL' },
        id(37),
      ),
    );
    expect(financeRow(prisma)).toMatchObject({
      cashIn: '0.00',
      journalPostedTotal: '200.00',
    });
  });

  it('marks account.created as ignored without changing projections', async () => {
    const { events, prisma } = buildServices();
    const result = await events.ingest(makeEvent('account.created', { accountId: id(67) }, id(38)));
    expect(result.status).toBe('ignored');
    expect(prisma.__stores.rptDailySummary).toHaveLength(0);
    expect(prisma.__stores.rptSupplierDaily).toHaveLength(0);
    expect(prisma.__stores.processedEvent).toHaveLength(1);
    expect(prisma.__stores.ingestAudit[0]).toMatchObject({
      eventId: id(38),
      eventType: 'account.created',
      status: 'ignored',
    });
  });

  it('projects inventory.purchase.received totals and count', async () => {
    const { events, prisma } = buildServices();
    await events.ingest(
      makeEvent(
        'inventory.purchase.received',
        {
          receiptId: id(68),
          lines: [
            { qty: '3.500', value: '10.00' },
            { qty: '1.250', value: '5.00' },
          ],
          totalValue: '15.00',
        },
        id(39),
      ),
    );
    expect(inventoryRow(prisma)).toMatchObject({
      purchaseQty: '4.750',
      purchaseValue: '15.00',
      receiptCount: 1,
    });
  });

  it('projects inventory.issue.posted totals and count', async () => {
    const { events, prisma } = buildServices();
    await events.ingest(
      makeEvent(
        'inventory.issue.posted',
        { issueId: id(69), lines: [{ qty: '2.000', value: '8.00' }], totalValue: '8.00' },
        id(41),
      ),
    );
    expect(inventoryRow(prisma)).toMatchObject({
      issueQty: '2.000',
      issueValue: '8.00',
      issueCount: 1,
    });
  });
});

describe('reporting-service monitor APIs', () => {
  const monitorPermission = request(['monitor:read']);

  it('returns zeroed today summary for an empty date', async () => {
    const { monitorController } = buildServices();
    const result = await unwrap(monitorController.today(monitorPermission));
    expect(result.date).toBe(new Date().toISOString().slice(0, 10));
    expect(result).toMatchObject({
      attendancePresent: 0,
      attendanceLate: 0,
      attendanceAbsent: 0,
      tripsStarted: 0,
      tripsEnded: 0,
      kgCollected: '0.000',
      kgWeighed: '0.000',
      suppliersPaid: '0.00',
      smsQueued: 0,
      smsSent: 0,
      smsDelivered: 0,
      smsFailed: 0,
    });
  });

  it('serialises today summary decimals with fixed scale', async () => {
    const { events, monitorController } = buildServices();
    const today = new Date().toISOString().slice(0, 10);
    const occurredAt = `${today}T10:00:00.000Z`;
    await events.ingest(
      makeEvent(
        'collection.finalized',
        { ...collectionPayload(), collectionDate: today },
        id(70),
        occurredAt,
      ),
    );
    await events.ingest(makeEvent('sms.queued', { messageId: id(71) }, id(71), occurredAt));
    const result = await unwrap(monitorController.today(monitorPermission));
    expect(result).toMatchObject({
      kgCollected: '12.345',
      kgWeighed: '12.345',
      suppliersPaid: '0.00',
      smsQueued: 1,
    });
  });

  it('lists active and recently ended trips but excludes stale ended trips', async () => {
    const { prisma, monitorController } = buildServices();
    const now = Date.now();
    prisma.__stores.rptTripLive.push(
      {
        tripId: IDS.trip,
        routeId: IDS.route,
        lorryId: IDS.lorry,
        status: 'STARTED',
        startedAt: new Date(now - 600_000),
        endedAt: null,
        lastEventId: id(72),
        sourceEventIds: [],
        updatedAt: new Date(now - 600_000),
      },
      {
        tripId: IDS.supplier,
        routeId: null,
        lorryId: null,
        status: 'ENDED',
        startedAt: new Date(now - 172_800_000),
        endedAt: new Date(now - 86_400_000),
        lastEventId: id(73),
        sourceEventIds: [],
        updatedAt: new Date(now - 86_400_000),
      },
      {
        tripId: IDS.person,
        routeId: null,
        lorryId: null,
        status: 'ENDED',
        startedAt: new Date(now - 3_110_400_000),
        endedAt: new Date(now - 2_592_000_000),
        lastEventId: id(74),
        sourceEventIds: [],
        updatedAt: new Date(now - 2_592_000_000),
      },
    );
    const result = await unwrap(monitorController.trips(monitorPermission));
    expect(result).toHaveLength(2);
    expect(result.map((trip: any) => trip.tripId)).toEqual(
      expect.arrayContaining([IDS.trip, IDS.supplier]),
    );
    expect(result.map((trip: any) => trip.tripId)).not.toContain(IDS.person);
    expect(result[0]).toMatchObject({
      status: 'STARTED',
      lastEventId: id(72),
      routeId: IDS.route,
      lorryId: IDS.lorry,
    });
  });

  it('returns attendance for an explicit date and defaults empty dates', async () => {
    const { events, monitorController } = buildServices();
    await events.ingest(makeEvent('attendance.day.closed', attendancePayload('LATE', 420), id(75)));
    const result = await unwrap(monitorController.attendance(monitorPermission, DAY));
    expect(result).toEqual({
      date: DAY,
      attendancePresent: 1,
      attendanceLate: 1,
      attendanceAbsent: 0,
    });
    const empty = await unwrap(monitorController.attendance(monitorPermission, ''));
    expect(empty.date).toBe(new Date().toISOString().slice(0, 10));
    expect(empty.attendancePresent).toBe(0);
  });

  it('returns supplier collection rows and totals for a date', async () => {
    const { events, monitorController } = buildServices();
    await events.ingest(makeEvent('collection.finalized', collectionPayload(), id(76)));
    const result = await unwrap(monitorController.collections(monitorPermission, DAY));
    expect(result.date).toBe(DAY);
    expect(result.suppliers).toHaveLength(1);
    expect(result.suppliers[0]).toMatchObject({
      supplierId: IDS.supplier,
      collectionKg: '12.345',
      collectionBags: 7,
      paidAmount: '0.00',
    });
    expect(result.totals).toEqual({
      collectionKg: '12.345',
      collectionBags: 7,
      paidAmount: '0.00',
    });
  });

  it('returns zeroed collections for an empty date', async () => {
    const { monitorController } = buildServices();
    const result = await unwrap(monitorController.collections(monitorPermission, ''));
    expect(result.suppliers).toEqual([]);
    expect(result.totals).toEqual({
      collectionKg: '0.000',
      collectionBags: 0,
      paidAmount: '0.00',
    });
  });

  it('denies finance access without monitor:finance', async () => {
    const { monitorController } = buildServices();
    const denied = monitorController.finance(monitorPermission);
    await expect(denied).rejects.toBeInstanceOf(ForbiddenError);
    await expect(denied).rejects.toThrow(/monitor:finance/);
  });

  it('returns finance snapshot values and netCash', async () => {
    const { prisma, monitorController } = buildServices();
    Object.assign(financeRow(prisma), {
      cashIn: '1000.00',
      cashOut: '250.00',
      payables: '300.00',
      journalPostedTotal: '1200.00',
      payrollApprovedTotal: '250.00',
      paymentPaidTotal: '75.00',
    });
    const result = await unwrap(monitorController.finance(request(['monitor:finance'])));
    expect(result).toEqual({
      cashIn: '1000.00',
      cashOut: '250.00',
      payables: '300.00',
      journalPostedTotal: '1200.00',
      payrollApprovedTotal: '250.00',
      paymentPaidTotal: '75.00',
      netCash: '750.00',
    });
  });

  it('returns inventory purchase and issue totals', async () => {
    const { events, monitorController } = buildServices();
    await events.ingest(
      makeEvent(
        'inventory.purchase.received',
        { lines: [{ qty: '3.500', value: '10.00' }], totalValue: '10.00' },
        id(77),
      ),
    );
    await events.ingest(
      makeEvent(
        'inventory.issue.posted',
        { lines: [{ qty: '2.000', value: '8.00' }], totalValue: '8.00' },
        id(78),
      ),
    );
    const result = await unwrap(monitorController.inventory(monitorPermission));
    expect(result).toEqual({
      purchaseQty: '3.500',
      purchaseValue: '10.00',
      issueQty: '2.000',
      issueValue: '8.00',
      receiptCount: 1,
      issueCount: 1,
    });
  });

  it('returns an idle rebuild stub', async () => {
    const { monitorController } = buildServices();
    const result = await unwrap(monitorController.rebuild(monitorPermission));
    expect(result.status).toBe('idle');
    expect(result.projections).toEqual([
      'rpt_daily_summary',
      'rpt_trip_live',
      'rpt_supplier_daily',
      'rpt_finance_snapshot',
      'rpt_inventory_snapshot',
    ]);
  });

  it('rejects malformed date query parameters', async () => {
    const { monitorController } = buildServices();
    await expect(
      monitorController.attendance(monitorPermission, '24-11-2026'),
    ).rejects.toThrow(/date must be YYYY-MM-DD/);
  });

  it('enforces monitor:read on every read endpoint', async () => {
    const { monitorController } = buildServices();
    await expect(monitorController.today(request())).rejects.toThrow(/monitor:read/);
    await expect(monitorController.trips(request())).rejects.toThrow(/monitor:read/);
    await expect(monitorController.attendance(request())).rejects.toThrow(
      /monitor:read/,
    );
    await expect(monitorController.collections(request())).rejects.toThrow(
      /monitor:read/,
    );
    await expect(monitorController.inventory(request())).rejects.toThrow(
      /monitor:read/,
    );
    await expect(monitorController.rebuild(request())).rejects.toThrow(
      /monitor:read/,
    );
  });
});
