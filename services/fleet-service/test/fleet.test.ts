import { beforeEach, describe, expect, it } from 'vitest';
import { BusinessRuleError, ConflictError, ValidationError, uuidv7 } from '@galatura/platform-kit';
import { FleetAuditService } from '../src/audit/audit.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { LorriesService } from '../src/lorries/lorries.service';
import { RoutesService } from '../src/routes/routes.service';
import { AssignmentsService } from '../src/assignments/assignments.service';
import { TripsService } from '../src/trips/trips.service';
import type { CollectionReadinessClient } from '../src/collection/collection-readiness.client';

function buildPrisma() {
  const tables: Record<string, any[]> = {
    lorry: [],
    lorryDocument: [],
    lorryMaintenance: [],
    route: [],
    routeStop: [],
    routeAssignment: [],
    trip: [],
    tripEvent: [],
    fleetAuditLog: [],
    outboxEvent: [],
  };

  const prisma: any = {
    ...Object.fromEntries(
      Object.entries(tables).map(([name, rows]) => [
        name,
        {
          findMany: async (args: any = {}) =>
            applyOrder(
              rows.filter((row) => matches(row, args.where)),
              args.orderBy,
            ).slice(0, args.take ?? 10_000),
          findFirst: async (args: any = {}) =>
            applyOrder(
              rows.filter((row) => matches(row, args.where)),
              args.orderBy,
            )[0] ?? null,
          findUnique: async (args: any = {}) =>
            rows.find((row) => matches(row, args.where)) ?? null,
          create: async (args: any) => {
            const row = {
              id: uuidv7(),
              createdAt: new Date(),
              updatedAt: new Date(),
              ...args.data,
            };
            rows.push(row);
            return row;
          },
          update: async (args: any) => {
            const row = rows.find((candidate) => matches(candidate, args.where));
            if (!row) return null;
            applyUpdate(row, args.data);
            return row;
          },
          deleteMany: async (args: any = {}) => {
            const before = rows.length;
            const kept = rows.filter((row) => !matches(row, args.where));
            rows.splice(0, rows.length, ...kept);
            return { count: before - kept.length };
          },
        },
      ]),
    ),
    $transaction: async (fn: any) => fn(prisma),
    __tables: tables,
  };
  return prisma;
}

function matches(row: any, where: any = {}): boolean {
  if (!where) return true;
  for (const [key, expected] of Object.entries(where)) {
    if (key === 'OR') {
      if (!(expected as any[]).some((entry) => matches(row, entry))) return false;
      continue;
    }
    if (!valueMatches(row[key], expected)) return false;
  }
  return true;
}

function valueMatches(actual: any, expected: any): boolean {
  if (expected === null) return actual === null || actual === undefined;
  if (expected instanceof Date) {
    return actual instanceof Date && actual.getTime() === expected.getTime();
  }
  if (expected && typeof expected === 'object' && !Array.isArray(expected)) {
    if ('lte' in expected && !(time(actual) <= time(expected.lte))) return false;
    if ('gte' in expected && !(time(actual) >= time(expected.gte))) return false;
    if ('gt' in expected && !(time(actual) > time(expected.gt))) return false;
    if ('lt' in expected && !(time(actual) < time(expected.lt))) return false;
    if ('in' in expected && !expected.in.includes(actual)) return false;
    if ('not' in expected) {
      if (expected.not === null && (actual === null || actual === undefined)) return false;
      if (expected.not !== null && actual === expected.not) return false;
    }
    if ('contains' in expected) {
      return String(actual ?? '')
        .toLowerCase()
        .includes(String(expected.contains).toLowerCase());
    }
    return true;
  }
  return actual === expected;
}

function time(value: any): number {
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'string') return Date.parse(value);
  return Number(value);
}

function applyUpdate(row: any, data: any): void {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && 'increment' in (value as any)) {
      row[key] = Number(row[key] ?? 0) + Number((value as any).increment);
    } else {
      row[key] = value;
    }
  }
  row.updatedAt = new Date();
}

function applyOrder(rows: any[], orderBy: any): any[] {
  if (!orderBy) return rows;
  const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
  return [...rows].sort((left, right) => {
    for (const order of orders) {
      const [field, direction] = Object.entries(order)[0] as [string, string];
      const compared = compareValues(left[field], right[field]);
      if (compared !== 0) return direction === 'desc' ? -compared : compared;
    }
    return 0;
  });
}

function compareValues(left: any, right: any): number {
  if (left instanceof Date && right instanceof Date) return left.getTime() - right.getTime();
  if (left === right) return 0;
  return left > right ? 1 : -1;
}

function context() {
  return { actorId: uuidv7(), ip: '127.0.0.1' };
}

const ROUTE_ID = '11111111-1111-4111-8111-111111111111';
const LORRY_ID = '22222222-2222-4222-8222-222222222222';

describe('fleet service', () => {
  let prisma: any;
  let lorryAudit: FleetAuditService;
  let outbox: OutboxService;

  beforeEach(() => {
    prisma = buildPrisma();
    lorryAudit = new FleetAuditService(prisma);
    outbox = new OutboxService(prisma);
  });

  async function startAtFactory(readiness: {
    ready: boolean;
    totalsFinalized: boolean;
    pendingSupplierIds: string[];
  }) {
    prisma.__tables.route.push({ id: ROUTE_ID, code: 'R1', name: 'Route 1' });
    prisma.__tables.lorry.push({
      id: LORRY_ID,
      registrationNo: 'WP-1',
      status: 'ACTIVE',
      currentOdometerKm: '1000.0',
    });
    const collection = { check: async () => readiness } as unknown as CollectionReadinessClient;
    const service = new TripsService(prisma, lorryAudit, outbox, collection);
    const owner = context();
    const trip = await service.start(
      {
        clientTripId: uuidv7(),
        routeId: ROUTE_ID,
        lorryId: LORRY_ID,
        startOdometerKm: '1000.0',
      },
      owner,
    );
    await service.arriveFactory(trip.id, owner);
    return { service, owner, trip };
  }

  it('creates a lorry and reports overdue document and maintenance alerts', async () => {
    const service = new LorriesService(prisma, lorryAudit);
    const actor = context();
    const lorry = await service.create(
      {
        registrationNo: 'wp cab 1234',
        make: 'Isuzu',
        model: 'NPR',
        currentOdometerKm: '15000.0',
        insuranceExpiry: '2026-11-01',
      },
      actor,
    );
    expect(lorry.registrationNo).toBe('WP CAB 1234');
    expect(prisma.__tables.fleetAuditLog).toHaveLength(1);

    await service.addMaintenance(
      lorry.id,
      {
        serviceDate: '2026-10-01',
        odometerKm: '14000.0',
        description: 'Oil service',
        nextDueKm: '15500.0',
        nextDueDate: '2026-11-20',
      },
      actor,
    );

    const result = await service.alerts(new Date('2026-11-18T00:00:00.000Z'));
    expect(result.alerts.map((alert: any) => alert.kind)).toEqual([
      'INSURANCE',
      'MAINTENANCE_DATE',
      'MAINTENANCE_KM',
    ]);
    expect(result.alerts[0].severity).toBe('OVERDUE');
  });

  it('replaces ordered route stops and rejects duplicate stops', async () => {
    const service = new RoutesService(prisma, lorryAudit);
    const route = await service.create({ code: 'r1', name: 'Route 1' }, context());
    const supplierA = uuidv7();
    const supplierB = uuidv7();

    await service.replaceStops(
      route.id,
      [
        { supplierId: supplierB, sequence: 2 },
        { supplierId: supplierA, sequence: 1, expectedArrival: '07:30' },
      ],
      context(),
    );
    expect(
      prisma.__tables.routeStop
        .filter((stop: any) => stop.routeId === route.id)
        .map((stop: any) => stop.sequence),
    ).toEqual([2, 1]);

    await expect(
      service.replaceStops(
        route.id,
        [
          { supplierId: supplierA, sequence: 1 },
          { supplierId: supplierA, sequence: 2 },
        ],
        context(),
      ),
    ).rejects.toBeInstanceOf(ConflictError);
  });

  it('prevents overlapping lorry assignments and preserves assignment history', async () => {
    prisma.__tables.route.push({ id: ROUTE_ID, code: 'R1', name: 'Route 1' });
    prisma.__tables.lorry.push({ id: LORRY_ID, registrationNo: 'WP-1', status: 'ACTIVE' });
    const service = new AssignmentsService(prisma, lorryAudit, outbox);
    const actor = context();

    const first = await service.create(
      {
        routeId: ROUTE_ID,
        lorryId: LORRY_ID,
        effectiveFrom: '2026-11-01',
        effectiveTo: '2026-11-30',
      },
      actor,
    );
    await expect(
      service.create(
        {
          routeId: ROUTE_ID,
          lorryId: LORRY_ID,
          effectiveFrom: '2026-11-15',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ConflictError);

    const changed = await service.change(
      first.id,
      { effectiveFrom: '2026-11-19', changeReason: 'Driver swapped' },
      actor,
    );
    const old = prisma.__tables.routeAssignment.find((row: any) => row.id === first.id);
    expect(old.status).toBe('ENDED');
    expect(old.effectiveTo.toISOString().slice(0, 10)).toBe('2026-11-19');
    expect(changed.assignment.previousAssignmentId).toBe(first.id);
    expect(prisma.__tables.outboxEvent[0].envelope.type).toBe('assignment.changed');
  });

  it('enforces odometer rules and only ends a trip after collection readiness', async () => {
    prisma.__tables.route.push({ id: ROUTE_ID, code: 'R1', name: 'Route 1' });
    prisma.__tables.lorry.push({
      id: LORRY_ID,
      registrationNo: 'WP-1',
      status: 'ACTIVE',
      currentOdometerKm: '1000.0',
    });
    let readiness = { ready: false, totalsFinalized: false, pendingSupplierIds: [uuidv7()] };
    const collection = {
      check: async () => readiness,
    } as unknown as CollectionReadinessClient;
    const service = new TripsService(prisma, lorryAudit, outbox, collection);
    const actor = context();
    const clientTripId = uuidv7();

    await expect(
      service.start(
        {
          clientTripId,
          routeId: ROUTE_ID,
          lorryId: LORRY_ID,
          startOdometerKm: '999.0',
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(ValidationError);

    const trip = await service.start(
      {
        clientTripId,
        routeId: ROUTE_ID,
        lorryId: LORRY_ID,
        startOdometerKm: '1000.0',
      },
      actor,
    );
    expect(trip.status).toBe('IN_PROGRESS');
    expect(prisma.__tables.outboxEvent[0].envelope.type).toBe('trip.started');

    const again = await service.start(
      {
        clientTripId,
        routeId: ROUTE_ID,
        lorryId: LORRY_ID,
        startOdometerKm: '1000.0',
      },
      actor,
    );
    expect(again.id).toBe(trip.id);
    expect(prisma.__tables.outboxEvent).toHaveLength(1);

    const event = await service.addEvent(
      trip.id,
      {
        eventType: 'BREAKDOWN',
        occurredAt: '2026-11-18T08:00:00.000Z',
        note: 'Flat tyre',
        clientEventId: uuidv7(),
      },
      actor,
    );
    expect(event.eventType).toBe('BREAKDOWN');

    await service.arriveFactory(trip.id, actor);
    await expect(service.end(trip.id, { endOdometerKm: '1050.0' }, actor)).rejects.toBeInstanceOf(
      BusinessRuleError,
    );

    readiness = { ready: true, totalsFinalized: true, pendingSupplierIds: [] };
    const ended = await service.end(trip.id, { endOdometerKm: '1050.0' }, actor);
    expect(ended.status).toBe('COMPLETED');
    expect(prisma.__tables.lorry[0].currentOdometerKm).toBe('1050.0');
    expect(prisma.__tables.outboxEvent.map((row: any) => row.envelope.type)).toEqual([
      'trip.started',
      'trip.ended',
    ]);
  });

  it('lets a non-owner with trip:end end a trip and persists endedBy', async () => {
    const { service, owner, trip } = await startAtFactory({
      ready: true,
      totalsFinalized: true,
      pendingSupplierIds: [],
    });
    const replacement = context();

    const ended = await service.end(trip.id, { endOdometerKm: '1050.0' }, replacement);

    expect(ended.endedBy).toBe(replacement.actorId);
    expect(ended.ownerPersonId).toBe(owner.actorId);
    expect(prisma.__tables.fleetAuditLog.at(-1).actorId).toBe(replacement.actorId);
    expect(prisma.__tables.outboxEvent.at(-1).envelope.payload.endedBy).toBe(replacement.actorId);
  });

  it('rejects an end odometer below the start odometer', async () => {
    const { service, trip } = await startAtFactory({
      ready: true,
      totalsFinalized: true,
      pendingSupplierIds: [],
    });

    await expect(
      service.end(trip.id, { endOdometerKm: '999.0' }, context()),
    ).rejects.toBeInstanceOf(ValidationError);
    expect(prisma.__tables.trip.find((row: any) => row.id === trip.id).status).toBe('AT_FACTORY');
    expect(
      prisma.__tables.outboxEvent.filter((row: any) => row.envelope.type === 'trip.ended'),
    ).toHaveLength(0);
  });

  it('overrides a not-finalised trip with a recorded reason, actor and event data', async () => {
    const { service, trip } = await startAtFactory({
      ready: false,
      totalsFinalized: false,
      pendingSupplierIds: [uuidv7()],
    });
    const admin = context();
    const reason = 'Weighbridge closed; supervisor authorised departure.';

    await expect(service.end(trip.id, { endOdometerKm: '1075.0' }, admin)).rejects.toBeInstanceOf(
      BusinessRuleError,
    );
    const ended = await service.overrideEnd(
      trip.id,
      { endOdometerKm: '1075.0', reason },
      admin,
    );

    expect(ended.status).toBe('COMPLETED');
    expect(ended.endedBy).toBe(admin.actorId);
    expect(ended.overrideKind).toBe('END_AFTER_TOTALS');
    expect(ended.overrideReason).toBe(reason);
    expect(ended.overrideBy).toBe(admin.actorId);
    expect(ended.overrideAt).toBeInstanceOf(Date);
    const audit = prisma.__tables.fleetAuditLog.at(-1);
    expect(audit.action).toBe('trip.ended.override');
    expect(audit.metadata.reason).toBe(reason);
    expect(audit.metadata.readiness.totalsFinalized).toBe(false);
    const event = prisma.__tables.outboxEvent.at(-1).envelope;
    expect(event.type).toBe('trip.ended');
    expect(event.payload.override.reason).toBe(reason);
    expect(event.payload.override.by).toBe(admin.actorId);
    expect(event.payload.override.readinessBypassed.totalsFinalized).toBe(false);
  });

  it('rejects an override without a non-empty reason', async () => {
    const { service, trip } = await startAtFactory({
      ready: false,
      totalsFinalized: false,
      pendingSupplierIds: [],
    });
    const admin = context();

    for (const reason of ['', '   ']) {
      await expect(
        service.overrideEnd(trip.id, { endOdometerKm: '1050.0', reason }, admin),
      ).rejects.toBeInstanceOf(ValidationError);
    }
    expect(prisma.__tables.trip.find((row: any) => row.id === trip.id).status).toBe('AT_FACTORY');
    expect(
      prisma.__tables.fleetAuditLog.filter((row: any) => row.action === 'trip.ended.override'),
    ).toHaveLength(0);
  });
});
