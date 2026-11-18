import { Injectable } from '@nestjs/common';
import { BusinessRuleError, ValidationError, uuidv7 } from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { requireActor, type RequestContext } from '../common/request';
import {
  serializeDiscrepancy,
  serializePickup,
  serializeTotal,
  serializeWeighing,
} from '../common/serialize';
import { dateTime, positiveInt, uuid } from '../common/validation';
import { PickupsService, type PickupInput } from '../pickups/pickups.service';

export interface SyncItem {
  type?: unknown;
  clientId?: unknown;
  payload?: PickupInput;
}

export interface SyncPushInput {
  deviceId?: unknown;
  sentAt?: unknown;
  items?: SyncItem[];
}

@Injectable()
export class SyncService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly pickups: PickupsService,
  ) {}

  async push(input: SyncPushInput, context: RequestContext) {
    requireActor(context);
    const deviceId = uuid(input.deviceId, 'deviceId');
    const sentAt = dateTime(input.sentAt, 'sentAt');
    const items = input.items;
    if (!Array.isArray(items)) throw new ValidationError('items must be an array.');
    if (items.length > 200) {
      throw new ValidationError('A sync batch may contain at most 200 items.');
    }
    const toleranceMs = Number(process.env.COLLECTION_CLOCK_SKEW_MS ?? 300_000);
    if (sentAt.getTime() > Date.now() + toleranceMs) {
      throw new BusinessRuleError('Device clock is too far ahead of server time.');
    }

    let accepted = 0;
    let rejected = 0;
    const errors: Array<{ index: number; code: string; message: string }> = [];

    for (const [index, item] of items.entries()) {
      try {
        if (item.type !== 'PICKUP') {
          throw new ValidationError(`Unsupported sync item type: ${String(item.type)}.`);
        }
        const payload = item.payload ?? {};
        await this.pickups.create(
          { ...payload, clientPickupId: item.clientId ?? payload.clientPickupId, deviceId },
          context,
        );
        accepted += 1;
      } catch (error) {
        rejected += 1;
        errors.push({
          index,
          code: (error as { code?: string }).code ?? 'SYNC_ITEM_REJECTED',
          message: error instanceof Error ? error.message : String(error),
        });
      }
    }

    await this.prisma.syncBatch.create({
      data: {
        id: uuidv7(),
        deviceId,
        receivedAt: new Date(),
        itemCount: items.length,
        accepted,
        rejected,
        errors,
      },
    });

    return {
      accepted,
      rejected,
      errors,
      serverTime: new Date().toISOString(),
    };
  }

  async pull(since: string | undefined, limitValue: string | undefined) {
    const cursor = since ? dateTime(since, 'since') : new Date(0);
    const limit = limitValue ? positiveInt(limitValue, 'limit') : 200;
    if (limit > 200) throw new ValidationError('limit cannot exceed 200.');

    const [pickups, weighings, totalRows, discrepancies] = await Promise.all([
      this.prisma.pickup.findMany({ where: { updatedAt: { gt: cursor } }, take: limit }),
      this.prisma.factoryWeighing.findMany({
        where: { updatedAt: { gt: cursor } },
        take: limit,
      }),
      this.prisma.dailySupplierTotal.findMany({
        where: { updatedAt: { gt: cursor } },
        take: limit,
      }),
      this.prisma.weightDiscrepancy.findMany({
        where: { updatedAt: { gt: cursor } },
        take: limit,
      }),
    ]);

    return {
      data: {
        pickups: pickups.map(serializePickup),
        weighings: weighings.map(serializeWeighing),
        dailyTotals: totalRows.map(serializeTotal),
        discrepancies: discrepancies.map(serializeDiscrepancy),
      },
      cursor: new Date().toISOString(),
      serverTime: new Date().toISOString(),
    };
  }
}
