import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BusinessRuleError, ValidationError, uuidv7 } from '@galatura/platform-kit';
import { CollectionAuditService } from '../src/audit/audit.service';
import { MasterDataService } from '../src/master-data/master-data.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { PickupsService } from '../src/pickups/pickups.service';
import { SyncService } from '../src/sync/sync.service';
import { WeighingsService } from '../src/weighings/weighings.service';

function buildPrisma() {
  const tables: Record<string, any[]> = {
    pickup: [],
    factoryWeighing: [],
    dailySupplierTotal: [],
    weightDiscrepancy: [],
    syncBatch: [],
    scale: [],
    outboxEvent: [],
    collectionAuditLog: [],
  };

  const prisma: any = {
    ...Object.fromEntries(
      Object.entries(tables).map(([name, rows]) => [
        name,
        {
          findMany: async (args: any = {}) =>
            rows.filter((row) => matches(row, args.where)).slice(0, args.take ?? 10_000),
          findFirst: async (args: any = {}) =>
            rows.filter((row) => matches(row, args.where))[0] ?? null,
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
            for (const [key, value] of Object.entries(args.data)) {
              if (value && typeof value === 'object' && 'increment' in value) {
                row[key] = Number(row[key] ?? 0) + Number((value as any).increment);
              } else {
                row[key] = value;
              }
            }
            row.updatedAt = new Date();
            return row;
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
    const entries = Object.entries(expected).filter(
      ([key]) => !['lte', 'gte', 'gt', 'lt', 'in', 'not'].includes(key),
    );
    return entries.length === 0 || matches(actual ?? {}, Object.fromEntries(entries));
  }
  return actual === expected;
}

function time(value: any): number {
  if (value instanceof Date) return value.getTime();
  return Date.parse(String(value));
}

function context() {
  return { actorId: uuidv7(), ip: '127.0.0.1' };
}

const TRIP_ID = '11111111-1111-4111-8111-111111111111';
const SUPPLIER_ID = '22222222-2222-4222-8222-222222222222';
const DEVICE_ID = '33333333-3333-4333-8333-333333333333';
const RECORDED_AT = '2026-11-18T06:30:00.000Z';

describe('collection service', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  let prisma: any;
  let audit: CollectionAuditService;
  let outbox: OutboxService;
  let pickups: PickupsService;
  let weighings: WeighingsService;
  let sync: SyncService;

  beforeEach(() => {
    prisma = buildPrisma();
    audit = new CollectionAuditService(prisma);
    outbox = new OutboxService(prisma);
    pickups = new PickupsService(prisma, audit);
    weighings = new WeighingsService(prisma, audit, outbox, pickups);
    sync = new SyncService(prisma, pickups);
  });

  function pickupInput(overrides: Record<string, unknown> = {}) {
    return {
      clientPickupId: uuidv7(),
      tripId: TRIP_ID,
      supplierId: SUPPLIER_ID,
      supplierRegNo: 'REG-1',
      grossWeightKg: '100.000',
      bagsCount: 10,
      tareKg: '5.000',
      recordedAtDevice: RECORDED_AT,
      deviceId: DEVICE_ID,
      scanMethod: 'BARCODE',
      ...overrides,
    };
  }

  it('records pickups idempotently and corrects by superseding', async () => {
    const actor = context();
    const input = pickupInput();
    const first = await pickups.create(input, actor);
    const second = await pickups.create(input, actor);
    expect(second.id).toBe(first.id);
    expect(prisma.__tables.pickup).toHaveLength(1);

    const corrected = await pickups.correct(
      first.id,
      { ...pickupInput(), changeReason: 'Scale re-read', grossWeightKg: '98.000' },
      actor,
    );
    expect(corrected.supersedesId).toBe(first.id);
    expect(prisma.__tables.pickup.find((row: any) => row.id === first.id).status).toBe('SUPERSEDED');
    expect((await pickups.listForTrip(TRIP_ID))[0].grossWeightKg).toBe('98.000');

    await expect(
      pickups.create(pickupInput({ scanMethod: 'REG_NO' }), actor),
    ).rejects.toBeInstanceOf(BusinessRuleError);
  });

  it('pushes sync items idempotently and rejects future-dated batches', async () => {
    const actor = context();
    const clientPickupId = uuidv7();
    const input = {
      deviceId: DEVICE_ID,
      sentAt: new Date().toISOString(),
      items: [
        {
          type: 'PICKUP',
          clientId: clientPickupId,
          payload: pickupInput({ clientPickupId }),
        },
        {
          type: 'PICKUP',
          clientId: clientPickupId,
          payload: pickupInput({ clientPickupId }),
        },
      ],
    };

    const result = await sync.push(input, actor);
    expect(result.accepted).toBe(2);
    expect(result.rejected).toBe(0);
    expect(prisma.__tables.pickup).toHaveLength(1);
    expect(prisma.__tables.syncBatch).toHaveLength(1);

    await expect(
      sync.push(
        {
          ...input,
          sentAt: new Date(Date.now() + 3_600_000).toISOString(),
          items: [],
        },
        actor,
      ),
    ).rejects.toBeInstanceOf(BusinessRuleError);
    await expect(sync.pull(undefined, '500')).rejects.toBeInstanceOf(ValidationError);
  });

  it('flags discrepancies, finalises totals, and emits collection.finalized', async () => {
    const actor = context();
    await pickups.create(pickupInput(), actor);
    await weighings.record(
      {
        clientWeighingId: uuidv7(),
        tripId: TRIP_ID,
        supplierId: SUPPLIER_ID,
        netWeightKg: '100.000',
        grossWeightKg: '100.000',
        tareKg: '0.000',
        bagsCount: 10,
        weighedAt: '2026-11-18T09:00:00.000Z',
      },
      actor,
    );

    expect(prisma.__tables.weightDiscrepancy).toHaveLength(1);
    expect(Number(prisma.__tables.weightDiscrepancy[0].diffPct)).toBeGreaterThan(2);
    expect(await weighings.readiness(TRIP_ID)).toEqual({
      ready: false,
      totalsFinalized: false,
      pendingSupplierIds: [SUPPLIER_ID],
    });

    const totals = await weighings.finalize(TRIP_ID, actor);
    expect(totals).toHaveLength(1);
    expect(totals[0].totalNetKg).toBe('100.000');
    expect(totals[0].totalBags).toBe(10);
    expect(prisma.__tables.outboxEvent).toHaveLength(1);
    expect(prisma.__tables.outboxEvent[0].envelope.type).toBe('collection.finalized');
    expect(prisma.__tables.outboxEvent[0].envelope.payload.dailyTotalId).toBe(totals[0].id);
    expect(await weighings.readiness(TRIP_ID)).toEqual({
      ready: true,
      totalsFinalized: true,
      pendingSupplierIds: [],
    });
  });

  it('pulls a delta master-data snapshot without sensitive fields', async () => {
    const fetchMock = vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        String(url).includes('people')
          ? [
              {
                supplierId: SUPPLIER_ID,
                code: 'S001',
                supplierCode: 'SUP-1',
                supplierRegNo: 'REG-1',
                supplierRegNoNormalized: 'REG1',
                barcodeValue: 'BC-1',
                fullName: 'Sunrise Estate',
                preferredName: 'Sunrise',
                phonePrimary: '0770000000',
                status: 'ACTIVE',
              },
            ]
          : [
              {
                id: uuidv7(),
                code: 'R1',
                name: 'Route 1',
                status: 'ACTIVE',
                stops: [{ id: uuidv7(), supplierId: SUPPLIER_ID, sequence: 1 }],
              },
            ],
    }));
    vi.stubGlobal('fetch', fetchMock);

    const snapshot = await new MasterDataService().pull(undefined);
    expect(snapshot.suppliers).toHaveLength(1);
    expect(snapshot.suppliers[0]).not.toHaveProperty('phonePrimary');
    expect(snapshot.routes[0].stops).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
