import { Injectable } from '@nestjs/common';
import {
  BusinessRuleError,
  ConflictError,
  NotFoundError,
  uuidv7,
} from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionAuditService } from '../audit/audit.service';
import { requireActor, type RequestContext } from '../common/request';
import { decimalText, serializePickup } from '../common/serialize';
import {
  dateTime,
  decimal,
  optionalString,
  optionalUuid,
  oneOf,
  positiveInt,
  requiredString,
  uuid,
} from '../common/validation';

export interface PickupInput {
  clientPickupId?: unknown;
  tripId?: unknown;
  routeStopId?: unknown;
  supplierId?: unknown;
  supplierRegNo?: unknown;
  supplierBarcode?: unknown;
  grossWeightKg?: unknown;
  bagsCount?: unknown;
  tareKg?: unknown;
  moistureDeductionKg?: unknown;
  qualityGrade?: unknown;
  recordedAtDevice?: unknown;
  gpsLat?: unknown;
  gpsLng?: unknown;
  scanMethod?: unknown;
  manualReason?: unknown;
  deviceId?: unknown;
  changeReason?: unknown;
}

const SCAN_METHODS = ['BARCODE', 'REG_NO'] as const;

@Injectable()
export class PickupsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: CollectionAuditService,
  ) {}

  async create(input: PickupInput, context: RequestContext) {
    const actorId = requireActor(context);
    const clientPickupId = uuid(input.clientPickupId, 'clientPickupId');
    const existing = await this.prisma.pickup.findUnique({ where: { clientPickupId } });
    if (existing) return serializePickup(existing);

    const data = this.parse(input, actorId, clientPickupId);
    const pickup = await this.prisma.pickup.create({ data });
    await this.audit.record({
      actorId,
      ip: context.ip,
      action: 'pickup.recorded',
      entityType: 'Pickup',
      entityId: pickup.id,
      metadata: { clientPickupId, tripId: pickup.tripId, supplierId: pickup.supplierId },
    });
    return serializePickup(pickup);
  }

  async correct(id: string, input: PickupInput, context: RequestContext) {
    const actorId = requireActor(context);
    const existing = await this.prisma.pickup.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Pickup not found.');
    if (existing.status !== 'RECORDED') {
      throw new ConflictError('Only a recorded pickup can be corrected.');
    }
    const reason = requiredString(input.changeReason, 'changeReason');
    const clientPickupId = input.clientPickupId
      ? uuid(input.clientPickupId, 'clientPickupId')
      : uuidv7();
    const duplicate = await this.prisma.pickup.findUnique({ where: { clientPickupId } });
    if (duplicate) return serializePickup(duplicate);

    const data = this.parse(
      {
        ...input,
        clientPickupId,
        tripId: input.tripId ?? existing.tripId,
        routeStopId: input.routeStopId ?? existing.routeStopId,
        supplierId: input.supplierId ?? existing.supplierId,
        supplierRegNo: input.supplierRegNo ?? existing.supplierRegNo,
        supplierBarcode: input.supplierBarcode ?? existing.supplierBarcode,
        deviceId: input.deviceId ?? existing.deviceId,
        scanMethod: input.scanMethod ?? existing.scanMethod,
        manualReason: input.manualReason ?? reason,
      },
      actorId,
      clientPickupId,
    );

    const corrected = await this.prisma.$transaction(async (tx: any) => {
      await tx.pickup.update({
        where: { id },
        data: { status: 'SUPERSEDED', version: { increment: 1 } },
      });
      return tx.pickup.create({
        data: {
          ...data,
          supersedesId: existing.id,
          version: Number(existing.version ?? 0) + 1,
        },
      });
    });
    await this.audit.record({
      actorId,
      ip: context.ip,
      action: 'pickup.corrected',
      entityType: 'Pickup',
      entityId: corrected.id,
      metadata: { supersedesId: existing.id, changeReason: reason },
    });
    return serializePickup(corrected);
  }

  async listForTrip(tripId: string) {
    const rows = await this.prisma.pickup.findMany({
      where: { tripId, status: { not: 'SUPERSEDED' } },
      orderBy: { recordedAtDevice: 'asc' },
    });
    return rows.map(serializePickup);
  }

  async scanPreview(supplierId: string) {
    const rows = await this.prisma.pickup.findMany({
      where: { supplierId, status: 'RECORDED' },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });
    return rows.map(serializePickup);
  }

  async manualEntries(from?: string, to?: string) {
    const fromDate = from ? new Date(`${from}T00:00:00.000Z`) : new Date('1970-01-01T00:00:00.000Z');
    const toDate = to ? new Date(`${to}T23:59:59.999Z`) : new Date(Date.now() + 86_400_000);
    const rows = await this.prisma.pickup.findMany({
      where: {
        scanMethod: 'REG_NO',
        recordedAtDevice: { gte: fromDate, lte: toDate },
      },
      orderBy: { recordedAtDevice: 'asc' },
    });
    const groups = new Map<string, { helperId: string; count: number; entries: unknown[] }>();
    for (const row of rows) {
      const key = String(row.recordedBy);
      const group = groups.get(key) ?? { helperId: key, count: 0, entries: [] };
      group.count += 1;
      group.entries.push(serializePickup(row));
      groups.set(key, group);
    }
    return [...groups.values()].sort((left, right) => right.count - left.count);
  }

  async recordablePickups(tripId: string) {
    const rows = await this.prisma.pickup.findMany({
      where: { tripId, status: 'RECORDED' },
      orderBy: { recordedAtDevice: 'asc' },
    });
    return rows;
  }

  private parse(input: PickupInput, actorId: string, clientPickupId: string) {
    const scanMethod = oneOf(input.scanMethod ?? 'BARCODE', SCAN_METHODS, 'scanMethod');
    const manualReason = optionalString(input.manualReason, 'manualReason');
    if (scanMethod === 'REG_NO' && !manualReason) {
      throw new BusinessRuleError('A manualReason is required for REG_NO pickups.');
    }
    return {
      id: uuidv7(),
      clientPickupId,
      tripId: uuid(input.tripId, 'tripId'),
      routeStopId: optionalUuid(input.routeStopId, 'routeStopId') ?? null,
      supplierId: uuid(input.supplierId, 'supplierId'),
      supplierRegNo: requiredString(input.supplierRegNo, 'supplierRegNo'),
      supplierBarcode: optionalString(input.supplierBarcode, 'supplierBarcode') ?? null,
      grossWeightKg: decimal(input.grossWeightKg, 'grossWeightKg')!,
      bagsCount: positiveInt(input.bagsCount, 'bagsCount'),
      tareKg: decimal(input.tareKg ?? '0', 'tareKg')!,
      moistureDeductionKg: decimal(input.moistureDeductionKg ?? '0', 'moistureDeductionKg')!,
      qualityGrade: optionalString(input.qualityGrade, 'qualityGrade') ?? null,
      recordedBy: actorId,
      recordedAtDevice: dateTime(input.recordedAtDevice, 'recordedAtDevice'),
      gpsLat: decimal(input.gpsLat, 'gpsLat', false) ?? null,
      gpsLng: decimal(input.gpsLng, 'gpsLng', false) ?? null,
      scanMethod: scanMethod as 'BARCODE' | 'REG_NO',
      manualReason: manualReason ?? null,
      status: 'RECORDED' as const,
      deviceId: uuid(input.deviceId, 'deviceId'),
      version: 0,
    };
  }
}
