import { Injectable } from '@nestjs/common';
import {
  BusinessRuleError,
  ConflictError,
  createEvent,
  NotFoundError,
  uuidv7,
  ValidationError,
  type EventEnvelope,
} from '@galatura/platform-kit';
import { $Enums } from '../../generated/prisma';
import { NotificationPublisherService } from '../events/notification-publisher.service';
import { PrismaService } from '../prisma/prisma.service';
import { CollectionAuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { PickupsService } from '../pickups/pickups.service';
import { requireActor, type RequestContext } from '../common/request';
import {
  decimalText,
  serializeDiscrepancy,
  serializeTotal,
  serializeWeighing,
} from '../common/serialize';
import {
  dateKey,
  dateOnly,
  dateTime,
  decimal,
  optionalString,
  optionalUuid,
  positiveInt,
  uuid,
} from '../common/validation';

export interface WeighingInput {
  clientWeighingId?: unknown;
  tripId?: unknown;
  supplierId?: unknown;
  pickupId?: unknown;
  netWeightKg?: unknown;
  grossWeightKg?: unknown;
  tareKg?: unknown;
  bagsCount?: unknown;
  deductionsKg?: unknown;
  qualityGrade?: unknown;
  scaleId?: unknown;
  weighedAt?: unknown;
}

export interface ResolveDiscrepancyInput {
  status?: unknown;
  note?: unknown;
}

type DiscrepancyStatus = 'OPEN' | 'ACCEPTED' | 'DISPUTED' | 'RESOLVED';

@Injectable()
export class WeighingsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: CollectionAuditService,
    private readonly outbox: OutboxService,
    private readonly pickups: PickupsService,
    private readonly notifications: NotificationPublisherService,
  ) {}

  async record(input: WeighingInput, context: RequestContext) {
    const actorId = requireActor(context);
    const clientWeighingId = uuid(input.clientWeighingId, 'clientWeighingId');
    const existing = await this.prisma.factoryWeighing.findUnique({ where: { clientWeighingId } });
    if (existing) return serializeWeighing(existing);

    const tripId = uuid(input.tripId, 'tripId');
    const supplierId = uuid(input.supplierId, 'supplierId');
    const pickupId = optionalUuid(input.pickupId, 'pickupId');
    const candidatePickups = await this.pickups.recordablePickups(tripId);
    const supplierPickups = candidatePickups.filter(
      (pickup) => String(pickup.supplierId) === supplierId,
    );
    if (supplierPickups.length === 0) {
      throw new BusinessRuleError('No recorded pickup exists for this supplier and trip.');
    }
    const matchedPickup = pickupId
      ? supplierPickups.find((pickup) => String(pickup.id) === pickupId)
      : supplierPickups[0];
    if (!matchedPickup) {
      throw new BusinessRuleError('The selected pickup does not belong to this supplier and trip.');
    }

    const data = {
      id: uuidv7(),
      clientWeighingId,
      tripId,
      supplierId,
      pickupId: matchedPickup.id,
      netWeightKg: decimal(input.netWeightKg, 'netWeightKg'),
      grossWeightKg: decimal(input.grossWeightKg, 'grossWeightKg'),
      tareKg: decimal(input.tareKg ?? '0', 'tareKg'),
      bagsCount: positiveInt(input.bagsCount, 'bagsCount'),
      deductionsKg: decimal(input.deductionsKg ?? '0', 'deductionsKg'),
      qualityGrade: optionalString(input.qualityGrade, 'qualityGrade') ?? null,
      scaleId: optionalString(input.scaleId, 'scaleId') ?? 'MANUAL',
      weighedBy: actorId,
      weighedAt: dateTime(input.weighedAt, 'weighedAt'),
      status: 'RECORDED',
      version: 0,
    };

    const weighing = await this.prisma.$transaction(async (tx: any) => {
      const created = await tx.factoryWeighing.create({ data });
      const fieldKg =
        Number(matchedPickup.grossWeightKg) -
        Number(matchedPickup.tareKg ?? 0) -
        Number(matchedPickup.moistureDeductionKg ?? 0);
      const factoryKg = Number(created.netWeightKg);
      const diffKg = factoryKg - fieldKg;
      const diffPct = fieldKg > 0 ? (Math.abs(diffKg) / fieldKg) * 100 : 0;
      const threshold = Number(process.env.COLLECTION_DISCREPANCY_PCT ?? 2);
      if (diffPct > threshold) {
        await tx.weightDiscrepancy.create({
          data: {
            id: uuidv7(),
            pickupId: matchedPickup.id,
            weighingId: created.id,
            fieldKg: fieldKg.toFixed(3),
            factoryKg: factoryKg.toFixed(3),
            diffKg: diffKg.toFixed(3),
            diffPct: diffPct.toFixed(3),
            status: 'OPEN',
            version: 0,
          },
        });
      }
      return created;
    });

    await this.audit.record({
      actorId,
      ip: context.ip,
      action: 'weighing.recorded',
      entityType: 'FactoryWeighing',
      entityId: weighing.id,
      metadata: { tripId, supplierId, pickupId: matchedPickup.id },
    });
    return serializeWeighing(weighing);
  }

  async finalize(tripId: string, context: RequestContext) {
    const actorId = requireActor(context);
    const pickups = await this.pickups.recordablePickups(tripId);
    if (pickups.length === 0) {
      throw new BusinessRuleError('There are no recorded pickups to finalise for this trip.');
    }
    const weighings = await this.prisma.factoryWeighing.findMany({
      where: { tripId, status: 'RECORDED' },
    });
    const weighingBySupplier = new Map<string, any>();
    for (const weighing of weighings) {
      weighingBySupplier.set(String(weighing.supplierId), weighing);
    }

    const groups = new Map<
      string,
      { supplierId: string; collectionDate: string; totalNetKg: number; totalBags: number }
    >();
    for (const pickup of pickups) {
      const supplierId = String(pickup.supplierId);
      const weighing = weighingBySupplier.get(supplierId);
      if (!weighing) {
        throw new BusinessRuleError(
          'Every supplier pickup must be weighed before totals can be finalised.',
          { details: { pendingSupplierIds: [supplierId] } },
        );
      }
      const collectionDate = dateKey(new Date(pickup.recordedAtDevice));
      const key = `${supplierId}:${collectionDate}`;
      const group = groups.get(key) ?? {
        supplierId,
        collectionDate,
        totalNetKg: 0,
        totalBags: 0,
      };
      group.totalNetKg += Number(weighing.netWeightKg);
      group.totalBags += Number(weighing.bagsCount);
      groups.set(key, group);
    }

    const now = new Date();
    const finalized: any[] = [];
    const finalizedEvents: EventEnvelope[] = [];
    await this.prisma.$transaction(async (tx: any) => {
      for (const group of groups.values()) {
        const collectionDate = new Date(`${group.collectionDate}T00:00:00.000Z`);
        let total = await tx.dailySupplierTotal.findUnique({
          where: {
            supplierId_collectionDate: {
              supplierId: group.supplierId,
              collectionDate,
            },
          },
        });
        if (total?.finalized) {
          finalized.push(total);
          continue;
        }
        const payload = {
          totalNetKg: group.totalNetKg.toFixed(3),
          totalBags: group.totalBags,
          tripId,
          supplierId: group.supplierId,
          collectionDate: group.collectionDate,
          finalizedAt: now.toISOString(),
          finalizedBy: actorId,
        };
        if (total) {
          total = await tx.dailySupplierTotal.update({
            where: { id: total.id },
            data: {
              ...payload,
              finalized: true,
              finalizedAt: now,
              finalizedBy: actorId,
              smsStatus: 'PENDING',
              version: { increment: 1 },
            },
          });
        } else {
          total = await tx.dailySupplierTotal.create({
            data: {
              id: uuidv7(),
              ...payload,
              finalized: true,
              finalizedAt: now,
              finalizedBy: actorId,
              smsStatus: 'PENDING',
              version: 0,
            },
          });
        }
        const event = createEvent({
          type: 'collection.finalized',
          version: 1,
          producer: 'collection-service',
          occurredAt: now,
          actor: { type: 'USER', id: actorId },
          payload: { ...payload, dailyTotalId: total.id },
        });
        await this.outbox.append(event, tx);
        finalizedEvents.push(event);
        finalized.push(total);
      }
    });

    await this.audit.record({
      actorId,
      ip: context.ip,
      action: 'collection.finalize',
      entityType: 'Collection',
      entityId: tripId,
      metadata: { supplierCount: finalized.length },
    });
    await this.notifications.publishFinalized(finalizedEvents);
    return finalized.map(serializeTotal);
  }

  async updateSmsStatus(
    id: string,
    input: { smsStatus?: unknown; smsMessageId?: unknown },
    context: RequestContext,
  ) {
    const totalId = uuid(id, 'id');
    const status = String(input.smsStatus ?? '');
    if (!['NOT_REQUIRED', 'PENDING', 'SENT', 'FAILED'].includes(status)) {
      throw new ValidationError('Unknown SMS status.');
    }
    const smsMessageId = optionalUuid(input.smsMessageId, 'smsMessageId');
    const existing = await this.prisma.dailySupplierTotal.findUnique({ where: { id: totalId } });
    if (!existing) throw new NotFoundError('Daily supplier total not found.');

    const total = await this.prisma.dailySupplierTotal.update({
      where: { id: totalId },
      data: {
        smsStatus: status as $Enums.SmsStatus,
        smsMessageId,
        version: { increment: 1 },
      },
    });
    await this.audit.record({
      actorId: context.actorId,
      ip: context.ip,
      action: 'collection.sms_status_updated',
      entityType: 'DailySupplierTotal',
      entityId: totalId,
      metadata: { smsStatus: status, smsMessageId },
    });
    return serializeTotal(total);
  }

  async readiness(tripId: string) {
    const pickups = await this.pickups.recordablePickups(tripId);
    if (pickups.length === 0) {
      return { ready: true, totalsFinalized: true, pendingSupplierIds: [] };
    }
    const [weighings, totals] = await Promise.all([
      this.prisma.factoryWeighing.findMany({ where: { tripId, status: 'RECORDED' } }),
      this.prisma.dailySupplierTotal.findMany({ where: { tripId, finalized: true } }),
    ]);
    const weighed = new Set(weighings.map((row: any) => String(row.supplierId)));
    const finalised = new Set(totals.map((row: any) => String(row.supplierId)));
    const suppliers = new Set(pickups.map((pickup: any) => String(pickup.supplierId)));
    const pendingSupplierIds = [...suppliers].filter(
      (supplierId) => !weighed.has(supplierId) || !finalised.has(supplierId),
    );
    return {
      ready: pendingSupplierIds.length === 0,
      totalsFinalized: pendingSupplierIds.length === 0,
      pendingSupplierIds,
    };
  }

  async listDiscrepancies(status?: string) {
    const rows = await this.prisma.weightDiscrepancy.findMany({
      where: status ? { status: status as DiscrepancyStatus } : undefined,
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(serializeDiscrepancy);
  }

  async resolveDiscrepancy(id: string, input: ResolveDiscrepancyInput, context: RequestContext) {
    const actorId = requireActor(context);
    const existing = await this.prisma.weightDiscrepancy.findUnique({ where: { id } });
    if (!existing) throw new NotFoundError('Discrepancy not found.');
    if (existing.status === 'RESOLVED') {
      throw new ConflictError('This discrepancy has already been resolved.');
    }
    const status = String(input.status ?? 'RESOLVED') as DiscrepancyStatus;
    if (!['OPEN', 'ACCEPTED', 'DISPUTED', 'RESOLVED'].includes(status)) {
      throw new ValidationError('Unknown discrepancy status.');
    }
    const updated = await this.prisma.weightDiscrepancy.update({
      where: { id },
      data: {
        status,
        note: optionalString(input.note, 'note') ?? null,
        resolvedBy: status === 'OPEN' ? null : actorId,
        version: { increment: 1 },
      },
    });
    await this.audit.record({
      actorId,
      ip: context.ip,
      action: 'weighing.discrepancy-resolved',
      entityType: 'WeightDiscrepancy',
      entityId: id,
      metadata: { status },
    });
    return serializeDiscrepancy(updated);
  }

  async dailyTotals(dateValue: string | undefined, supplierId: string | undefined) {
    const rows = await this.prisma.dailySupplierTotal.findMany({
      where: {
        ...(dateValue ? { collectionDate: dateOnly(dateValue, 'date') } : {}),
        ...(supplierId ? { supplierId: uuid(supplierId, 'supplierId') } : {}),
      },
      orderBy: { collectionDate: 'desc' },
    });
    return rows.map(serializeTotal);
  }

  async statement(supplierId: string, from: string | undefined, to: string | undefined) {
    const id = uuid(supplierId, 'supplierId');
    const fromDate = from ? dateOnly(from, 'from') : new Date('1970-01-01T00:00:00.000Z');
    const toDate = to ? dateOnly(to, 'to') : new Date(Date.now() + 86_400_000);
    const rows = await this.prisma.dailySupplierTotal.findMany({
      where: {
        supplierId: id,
        collectionDate: { gte: fromDate, lte: toDate },
      },
      orderBy: { collectionDate: 'asc' },
    });
    return rows.map(serializeTotal);
  }
}
