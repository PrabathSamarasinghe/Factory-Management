import { Injectable } from '@nestjs/common';
import { BusinessRuleError, ValidationError } from '@galatura/platform-kit';
import type { EventEnvelope } from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { moneyText, quantityText } from '../common/serializers';
import {
  dateOnly,
  dateText,
  dateTime,
  money,
  optionalDateTime,
  optionalString,
  optionalUuid,
  quantity,
  requiredString,
  uuid,
} from '../common/validation';

const CONSUMER = 'reporting-service';
const MAX_SOURCE_EVENT_IDS = 50;
const FINANCE_ID = 'finance-current';
const INVENTORY_ID = 'inventory-current';

type ProcessStatus = 'processed' | 'ignored';

interface SourceEvent {
  id: string;
  type: string;
  occurredAt: string;
}

interface IngestResult {
  status: ProcessStatus | 'duplicate';
  eventId: string;
  type: string;
}

const SMS_COUNTERS: Record<string, string> = {
  'sms.queued': 'smsQueued',
  'sms.sent': 'smsSent',
  'sms.delivered': 'smsDelivered',
  'sms.failed': 'smsFailed',
};

@Injectable()
export class EventsService {
  constructor(private readonly prisma: PrismaService) {}

  async ingest(event: EventEnvelope<any>): Promise<IngestResult> {
    const eventId = uuid(event?.id, 'event.id');
    const type = requiredString(event?.type, 'event.type');
    if (event?.version !== 1) {
      throw new BusinessRuleError('Only event version 1 is supported.');
    }

    const existing = await this.prisma.processedEvent.findFirst({
      where: { consumer: CONSUMER, id: eventId },
    });
    if (existing) return { status: 'duplicate', eventId, type };

    const occurredAt = dateTime(event?.occurredAt, 'event.occurredAt').toISOString();
    const source: SourceEvent = { id: eventId, type, occurredAt };
    const payload = (event?.payload ?? {}) as Record<string, any>;
    let status: ProcessStatus = 'processed';

    try {
      await this.prisma.$transaction(async (tx) => {
        const client: any = tx;
        status = await this.apply(type, eventId, source, payload, client);
        await client.processedEvent.create({
          data: { id: eventId, consumer: CONSUMER, type, processedAt: new Date() },
        });
        await client.ingestAudit.create({
          data: { eventId, eventType: type, status, createdAt: new Date() },
        });
      });
    } catch (error) {
      await this.prisma.ingestAudit
        .create({
          data: {
            eventId,
            eventType: type,
            status: 'failed',
            error: errorMessage(error),
            createdAt: new Date(),
          },
        })
        .catch(() => undefined);
      throw error;
    }

    return { status, eventId, type };
  }

  private async apply(
    type: string,
    eventId: string,
    source: SourceEvent,
    payload: Record<string, any>,
    client: any,
  ): Promise<ProcessStatus> {
    switch (type) {
      case 'collection.finalized':
        await this.applyCollectionFinalized(client, source, payload);
        return 'processed';
      case 'attendance.day.closed':
        await this.applyAttendance(client, source, payload);
        return 'processed';
      case 'trip.started':
        await this.applyTripStarted(client, eventId, source, payload);
        return 'processed';
      case 'trip.ended':
        await this.applyTripEnded(client, eventId, source, payload);
        return 'processed';
      case 'assignment.changed':
        await this.applyAssignmentChanged(client, eventId, source, payload);
        return 'processed';
      case 'sms.queued':
      case 'sms.sent':
      case 'sms.delivered':
      case 'sms.failed':
        await this.applySmsStatus(client, type, source, payload);
        return 'processed';
      case 'payment.paid':
        await this.applyPaymentPaid(client, source, payload);
        return 'processed';
      case 'payroll.approved':
        await this.applyPayrollApproved(client, source, payload);
        return 'processed';
      case 'journal.posted':
        await this.applyJournalPosted(client, source, payload);
        return 'processed';
      case 'inventory.purchase.received':
        await this.applyInventoryPurchase(client, source, payload);
        return 'processed';
      case 'inventory.issue.posted':
        await this.applyInventoryIssue(client, source, payload);
        return 'processed';
      case 'account.created':
        return 'ignored';
      default:
        return 'ignored';
    }
  }

  private async applyCollectionFinalized(
    client: any,
    source: SourceEvent,
    payload: Record<string, any>,
  ): Promise<void> {
    const supplierId = uuid(payload.supplierId, 'payload.supplierId');
    const collectionDate = dateOnly(payload.collectionDate, 'payload.collectionDate');
    const kgText = quantity(payload.totalNetKg, 'payload.totalNetKg');
    const bags = nonNegativeInt(payload.totalBags, 'payload.totalBags');
    const kg = Number(kgText);

    await this.updateDaily(
      client,
      collectionDate,
      (row) => ({
        kgCollected: quantityText(Number(row.kgCollected ?? 0) + kg),
        kgWeighed: quantityText(Number(row.kgWeighed ?? 0) + kg),
      }),
      source,
    );
    await this.updateSupplierDaily(
      client,
      supplierId,
      collectionDate,
      (row) => ({
        collectionKg: quantityText(Number(row.collectionKg ?? 0) + kg),
        collectionBags: Number(row.collectionBags ?? 0) + bags,
      }),
      source,
    );
  }

  private async applyAttendance(
    client: any,
    source: SourceEvent,
    payload: Record<string, any>,
  ): Promise<void> {
    const workDate = dateOnly(payload.workDate, 'payload.workDate');
    const status = requiredString(payload.status, 'payload.status').toUpperCase();
    const workedMinutes = nonNegativeInt(payload.workedMinutes, 'payload.workedMinutes');
    let present = 0;
    let late = 0;
    let absent = 0;

    if (status === 'PRESENT' || status === 'WORKED') {
      present = 1;
    } else if (status === 'LATE') {
      present = 1;
      late = 1;
    } else if (status === 'ABSENT') {
      absent = 1;
    } else if (workedMinutes > 0) {
      present = 1;
    }

    await this.updateDaily(
      client,
      workDate,
      (row) => ({
        attendancePresent: Number(row.attendancePresent ?? 0) + present,
        attendanceLate: Number(row.attendanceLate ?? 0) + late,
        attendanceAbsent: Number(row.attendanceAbsent ?? 0) + absent,
      }),
      source,
    );
  }

  private async applyTripStarted(
    client: any,
    eventId: string,
    source: SourceEvent,
    payload: Record<string, any>,
  ): Promise<void> {
    const tripId = uuid(payload.tripId, 'payload.tripId');
    const startedAt = dateTime(payload.startedAt, 'payload.startedAt');
    const existing = await client.rptTripLive.findUnique({ where: { tripId } });
    const row = {
      tripId,
      routeId: optionalUuid(payload.routeId, 'payload.routeId') ?? existing?.routeId ?? null,
      lorryId: optionalUuid(payload.lorryId, 'payload.lorryId') ?? existing?.lorryId ?? null,
      status: 'STARTED',
      startedAt,
      endedAt: null,
      lastEventId: eventId,
      sourceEventIds: appendSource(existing?.sourceEventIds, source),
      updatedAt: new Date(),
    };

    await client.rptTripLive.upsert({ where: { tripId }, update: row, create: row });
    await this.updateDaily(
      client,
      startedAt,
      (daily) => ({ tripsStarted: Number(daily.tripsStarted ?? 0) + 1 }),
      source,
    );
  }

  private async applyTripEnded(
    client: any,
    eventId: string,
    source: SourceEvent,
    payload: Record<string, any>,
  ): Promise<void> {
    const tripId = uuid(payload.tripId, 'payload.tripId');
    const endedAt = dateTime(payload.endedAt, 'payload.endedAt');
    const existing = await client.rptTripLive.findUnique({ where: { tripId } });
    const startedAt = existing?.startedAt
      ? new Date(existing.startedAt)
      : (optionalDateTime(payload.startedAt, 'payload.startedAt') ?? null);
    const row = {
      tripId,
      routeId: optionalUuid(payload.routeId, 'payload.routeId') ?? existing?.routeId ?? null,
      lorryId: optionalUuid(payload.lorryId, 'payload.lorryId') ?? existing?.lorryId ?? null,
      status: 'ENDED',
      startedAt,
      endedAt,
      lastEventId: eventId,
      sourceEventIds: appendSource(existing?.sourceEventIds, source),
      updatedAt: new Date(),
    };

    await client.rptTripLive.upsert({ where: { tripId }, update: row, create: row });
    await this.updateDaily(
      client,
      endedAt,
      (daily) => ({ tripsEnded: Number(daily.tripsEnded ?? 0) + 1 }),
      source,
    );
  }

  private async applyAssignmentChanged(
    client: any,
    eventId: string,
    source: SourceEvent,
    payload: Record<string, any>,
  ): Promise<void> {
    const tripId = findTripId(payload);
    if (!tripId) return;

    const existing = await client.rptTripLive.findUnique({ where: { tripId } });
    if (!existing) return;

    await client.rptTripLive.update({
      where: { tripId },
      data: {
        routeId: optionalUuid(payload.routeId, 'payload.routeId') ?? existing.routeId ?? null,
        lorryId: optionalUuid(payload.lorryId, 'payload.lorryId') ?? existing.lorryId ?? null,
        lastEventId: eventId,
        sourceEventIds: appendSource(existing.sourceEventIds, source),
        updatedAt: new Date(),
      },
    });
  }

  private async applySmsStatus(
    client: any,
    type: string,
    source: SourceEvent,
    payload: Record<string, any>,
  ): Promise<void> {
    optionalString(payload.messageId, 'payload.messageId');
    const field = SMS_COUNTERS[type];
    await this.updateDaily(
      client,
      new Date(source.occurredAt),
      (row) => ({ [field]: Number(row[field] ?? 0) + 1 }),
      source,
    );
  }

  private async applyPaymentPaid(
    client: any,
    source: SourceEvent,
    payload: Record<string, any>,
  ): Promise<void> {
    const amountText = money(payload.amount, 'payload.amount');
    const amount = Number(amountText);
    const paidDate = dateTime(payload.paidDate, 'payload.paidDate');
    const payeeType = requiredString(payload.payeeType, 'payload.payeeType').toUpperCase();

    await this.updateFinance(
      client,
      (row) => ({
        cashOut: moneyText(Number(row.cashOut ?? 0) + amount),
        payables: moneyText(Number(row.payables ?? 0) - amount),
        paymentPaidTotal: moneyText(Number(row.paymentPaidTotal ?? 0) + amount),
      }),
      source,
    );

    if (payeeType === 'SUPPLIER') {
      const supplierId = uuid(payload.payeeId, 'payload.payeeId');
      await this.updateSupplierDaily(
        client,
        supplierId,
        paidDate,
        (row) => ({ paidAmount: moneyText(Number(row.paidAmount ?? 0) + amount) }),
        source,
      );
      await this.updateDaily(
        client,
        paidDate,
        (row) => ({
          suppliersPaidDecimal: moneyText(Number(row.suppliersPaidDecimal ?? 0) + amount),
        }),
        source,
      );
    }
  }

  private async applyPayrollApproved(
    client: any,
    source: SourceEvent,
    payload: Record<string, any>,
  ): Promise<void> {
    const amountText = money(payload.netTotal ?? payload.grossTotal, 'payload.netTotal');
    const amount = Number(amountText);
    await this.updateFinance(
      client,
      (row) => ({
        cashOut: moneyText(Number(row.cashOut ?? 0) + amount),
        payrollApprovedTotal: moneyText(Number(row.payrollApprovedTotal ?? 0) + amount),
      }),
      source,
    );
  }

  private async applyJournalPosted(
    client: any,
    source: SourceEvent,
    payload: Record<string, any>,
  ): Promise<void> {
    const debit = Number(money(payload.debitTotal, 'payload.debitTotal'));
    const sourceType = requiredString(payload.sourceType, 'payload.sourceType').toUpperCase();
    await this.updateFinance(
      client,
      (row) => ({
        cashIn: moneyText(Number(row.cashIn ?? 0) + (sourceType === 'COLLECTION' ? debit : 0)),
        journalPostedTotal: moneyText(Number(row.journalPostedTotal ?? 0) + debit),
      }),
      source,
    );
  }

  private async applyInventoryPurchase(
    client: any,
    source: SourceEvent,
    payload: Record<string, any>,
  ): Promise<void> {
    const value = Number(money(payload.totalValue, 'payload.totalValue'));
    const qty = sumLineQuantity(payload.lines);
    await this.updateInventory(
      client,
      (row) => ({
        purchaseQty: quantityText(Number(row.purchaseQty ?? 0) + qty),
        purchaseValue: moneyText(Number(row.purchaseValue ?? 0) + value),
        receiptCount: Number(row.receiptCount ?? 0) + 1,
      }),
      source,
    );
  }

  private async applyInventoryIssue(
    client: any,
    source: SourceEvent,
    payload: Record<string, any>,
  ): Promise<void> {
    const value = Number(money(payload.totalValue, 'payload.totalValue'));
    const qty = sumLineQuantity(payload.lines);
    await this.updateInventory(
      client,
      (row) => ({
        issueQty: quantityText(Number(row.issueQty ?? 0) + qty),
        issueValue: moneyText(Number(row.issueValue ?? 0) + value),
        issueCount: Number(row.issueCount ?? 0) + 1,
      }),
      source,
    );
  }

  private async updateDaily(
    client: any,
    date: Date,
    change: (row: any) => Record<string, unknown>,
    source: SourceEvent,
  ): Promise<void> {
    const key = utcDate(date);
    const existing = await client.rptDailySummary.findUnique({ where: { date: key } });
    const base = existing ?? emptyDaily(key);
    const next = {
      ...base,
      ...change(base),
      date: key,
      sourceEventIds: appendSource(existing?.sourceEventIds, source),
      updatedAt: new Date(),
    };

    await client.rptDailySummary.upsert({ where: { date: key }, update: next, create: next });
  }

  private async updateSupplierDaily(
    client: any,
    supplierId: string,
    date: Date,
    change: (row: any) => Record<string, unknown>,
    source: SourceEvent,
  ): Promise<void> {
    const keyDate = utcDate(date);
    const id = `${supplierId}:${dateText(keyDate)}`;
    const existing = await client.rptSupplierDaily.findUnique({ where: { id } });
    const base = existing ?? emptySupplierDaily(id, supplierId, keyDate);
    const next = {
      ...base,
      ...change(base),
      id,
      supplierId,
      date: keyDate,
      sourceEventIds: appendSource(existing?.sourceEventIds, source),
      updatedAt: new Date(),
    };

    await client.rptSupplierDaily.upsert({ where: { id }, update: next, create: next });
  }

  private async updateFinance(
    client: any,
    change: (row: any) => Record<string, unknown>,
    source: SourceEvent,
  ): Promise<void> {
    const existing = await client.rptFinanceSnapshot.findUnique({ where: { id: FINANCE_ID } });
    const base = existing ?? emptyFinance();
    const next = {
      ...base,
      ...change(base),
      id: FINANCE_ID,
      sourceEventIds: appendSource(existing?.sourceEventIds, source),
      updatedAt: new Date(),
    };

    await client.rptFinanceSnapshot.upsert({
      where: { id: FINANCE_ID },
      update: next,
      create: next,
    });
  }

  private async updateInventory(
    client: any,
    change: (row: any) => Record<string, unknown>,
    source: SourceEvent,
  ): Promise<void> {
    const existing = await client.rptInventorySnapshot.findUnique({ where: { id: INVENTORY_ID } });
    const base = existing ?? emptyInventory();
    const next = {
      ...base,
      ...change(base),
      id: INVENTORY_ID,
      sourceEventIds: appendSource(existing?.sourceEventIds, source),
      updatedAt: new Date(),
    };

    await client.rptInventorySnapshot.upsert({
      where: { id: INVENTORY_ID },
      update: next,
      create: next,
    });
  }
}

function emptyDaily(date: Date) {
  return {
    date,
    attendancePresent: 0,
    attendanceLate: 0,
    attendanceAbsent: 0,
    tripsStarted: 0,
    tripsEnded: 0,
    kgCollected: quantityText(0),
    kgWeighed: quantityText(0),
    suppliersPaidDecimal: moneyText(0),
    smsQueued: 0,
    smsSent: 0,
    smsDelivered: 0,
    smsFailed: 0,
    sourceEventIds: [] as SourceEvent[],
  };
}

function emptySupplierDaily(id: string, supplierId: string, date: Date) {
  return {
    id,
    supplierId,
    date,
    collectionKg: quantityText(0),
    collectionBags: 0,
    paidAmount: moneyText(0),
    sourceEventIds: [] as SourceEvent[],
  };
}

function emptyFinance() {
  return {
    id: FINANCE_ID,
    cashIn: moneyText(0),
    cashOut: moneyText(0),
    payables: moneyText(0),
    journalPostedTotal: moneyText(0),
    payrollApprovedTotal: moneyText(0),
    paymentPaidTotal: moneyText(0),
    sourceEventIds: [] as SourceEvent[],
  };
}

function emptyInventory() {
  return {
    id: INVENTORY_ID,
    purchaseQty: quantityText(0),
    purchaseValue: moneyText(0),
    issueQty: quantityText(0),
    issueValue: moneyText(0),
    receiptCount: 0,
    issueCount: 0,
    sourceEventIds: [] as SourceEvent[],
  };
}

function appendSource(current: unknown, source: SourceEvent): SourceEvent[] {
  const rows = Array.isArray(current) ? (current as SourceEvent[]) : [];
  return [...rows, source].slice(-MAX_SOURCE_EVENT_IDS);
}

function utcDate(value: Date): Date {
  const date = value instanceof Date ? value : new Date(value);
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
}

function nonNegativeInt(value: unknown, label: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new ValidationError(`${label} must be a non-negative whole number.`);
  }
  return parsed;
}

function sumLineQuantity(lines: unknown): number {
  if (!Array.isArray(lines)) return 0;
  return lines.reduce((total, line: any) => {
    const parsed = Number(line?.qty ?? 0);
    return total + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);
}

function findTripId(payload: Record<string, any>): string | undefined {
  for (const [key, value] of Object.entries(payload)) {
    const normalised = key.replace(/[^a-z0-9]/gi, '').toLowerCase();
    if (normalised.endsWith('tripid') && typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
