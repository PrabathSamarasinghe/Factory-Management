import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  moneyText,
  quantityText,
  serializeAttendance,
  serializeDaily,
  serializeFinance,
  serializeInventory,
  serializeSupplier,
  serializeTrip,
} from '../common/serializers';
import { dateOnly, dateText } from '../common/validation';

const FINANCE_ID = 'finance-current';
const INVENTORY_ID = 'inventory-current';
const PROJECTIONS = [
  'rpt_daily_summary',
  'rpt_trip_live',
  'rpt_supplier_daily',
  'rpt_finance_snapshot',
  'rpt_inventory_snapshot',
];

@Injectable()
export class MonitorService {
  constructor(private readonly prisma: PrismaService) {}

  async today() {
    const row = await this.daily(todayUtc());
    return serializeDaily(row);
  }

  async trips() {
    const cutoff = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.rptTripLive.findMany({
      where: {
        OR: [{ status: 'STARTED' }, { status: 'ENDED', endedAt: { gte: cutoff } }],
      },
      orderBy: { updatedAt: 'desc' },
    });
    return rows.map(serializeTrip);
  }

  async attendance(date?: string) {
    const key = this.queryDate(date);
    return serializeAttendance(await this.daily(key));
  }

  async collections(date?: string) {
    const key = this.queryDate(date);
    const rows = await this.prisma.rptSupplierDaily.findMany({ where: { date: key } });
    const totals = rows.reduce(
      (sum: any, row: any) => ({
        collectionKg: sum.collectionKg + Number(row.collectionKg ?? 0),
        collectionBags: sum.collectionBags + Number(row.collectionBags ?? 0),
        paidAmount: sum.paidAmount + Number(row.paidAmount ?? 0),
      }),
      { collectionKg: 0, collectionBags: 0, paidAmount: 0 },
    );

    return {
      date: dateText(key),
      suppliers: rows.map(serializeSupplier),
      totals: {
        collectionKg: quantityText(totals.collectionKg),
        collectionBags: totals.collectionBags,
        paidAmount: moneyText(totals.paidAmount),
      },
    };
  }

  async finance() {
    const row = await this.prisma.rptFinanceSnapshot.findUnique({ where: { id: FINANCE_ID } });
    return serializeFinance(row ?? emptyFinance());
  }

  async inventory() {
    const row = await this.prisma.rptInventorySnapshot.findUnique({ where: { id: INVENTORY_ID } });
    return serializeInventory(row ?? emptyInventory());
  }

  rebuild() {
    return { status: 'idle', projections: PROJECTIONS };
  }

  private async daily(date: Date) {
    return (await this.prisma.rptDailySummary.findUnique({ where: { date } })) ?? emptyDaily(date);
  }

  private queryDate(value?: string): Date {
    if (!value) return todayUtc();
    return dateOnly(value, 'date');
  }
}

function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
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
    sourceEventIds: [],
  };
}

function emptyFinance() {
  return {
    cashIn: moneyText(0),
    cashOut: moneyText(0),
    payables: moneyText(0),
    journalPostedTotal: moneyText(0),
    payrollApprovedTotal: moneyText(0),
    paymentPaidTotal: moneyText(0),
  };
}

function emptyInventory() {
  return {
    purchaseQty: quantityText(0),
    purchaseValue: moneyText(0),
    issueQty: quantityText(0),
    issueValue: moneyText(0),
    receiptCount: 0,
    issueCount: 0,
  };
}
