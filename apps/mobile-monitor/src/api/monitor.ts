import { apiClient } from './client';

export interface MonitorToday {
  date: string;
  attendance: { present: number; absent: number; late: number };
  collections: { totalKg: number; suppliers?: number };
  trips: { active: number; completed: number };
  alerts: number;
}

export interface MonitorTrip {
  id: string;
  route: string;
  status: string;
  vehicle?: string;
  startedAt?: string;
}

export interface MonitorAttendance {
  present: number;
  absent: number;
  late: number;
  shifts?: Array<{ name: string; present: number; total: number }>;
}

export interface MonitorCollection {
  totalKg: number;
  supplierCount: number;
  routeCount?: number;
  recent?: Array<{ route: string; kg: number }>;
}

export interface MonitorFinance {
  cashOnHand?: number;
  receivables?: number;
  payables?: number;
  currency?: string;
}

export interface MonitorInventory {
  items?: Array<{ name: string; quantity: number; unit: string }>;
  lowStockCount?: number;
  receiptCount?: number;
  issueCount?: number;
  purchaseValue?: string;
  issueValue?: string;
}

interface RawDaily {
  date: string;
  attendancePresent: number;
  attendanceLate: number;
  attendanceAbsent: number;
  tripsStarted: number;
  tripsEnded: number;
  kgCollected: string;
  smsQueued: number;
  smsSent: number;
  smsDelivered: number;
  smsFailed: number;
}

interface RawTrip {
  tripId: string;
  routeId?: string | null;
  lorryId?: string | null;
  status: string;
  startedAt?: string | null;
}

interface RawAttendance {
  date: string;
  attendancePresent: number;
  attendanceLate: number;
  attendanceAbsent: number;
}

interface RawSupplierDaily {
  supplierId: string;
  collectionKg: string;
}

interface RawCollections {
  suppliers: RawSupplierDaily[];
  totals: { collectionKg: string };
}

interface RawFinance {
  netCash: string;
  payables: string;
}

interface RawInventory {
  purchaseValue: string;
  issueValue: string;
  receiptCount: number;
  issueCount: number;
}

function toNumber(value: unknown): number {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function getToday(): Promise<MonitorToday> {
  const raw = await apiClient.get<RawDaily>('/monitor/today');
  return {
    date: raw.date,
    attendance: {
      present: toNumber(raw.attendancePresent),
      absent: toNumber(raw.attendanceAbsent),
      late: toNumber(raw.attendanceLate),
    },
    collections: { totalKg: toNumber(raw.kgCollected) },
    trips: {
      active: toNumber(raw.tripsStarted),
      completed: toNumber(raw.tripsEnded),
    },
    alerts: toNumber(raw.smsFailed),
  };
}

export async function getTrips(): Promise<MonitorTrip[]> {
  const rows = await apiClient.get<RawTrip[]>('/monitor/trips');
  return rows.map((row) => ({
    id: row.tripId,
    route: row.routeId ?? 'Route',
    status:
      row.status === 'STARTED'
        ? 'ACTIVE'
        : row.status === 'ENDED'
          ? 'COMPLETED'
          : row.status,
    vehicle: row.lorryId ?? undefined,
    startedAt: row.startedAt ?? undefined,
  }));
}

export async function getAttendance(): Promise<MonitorAttendance> {
  const raw = await apiClient.get<RawAttendance>('/monitor/attendance');
  return {
    present: toNumber(raw.attendancePresent),
    absent: toNumber(raw.attendanceAbsent),
    late: toNumber(raw.attendanceLate),
  };
}

export async function getCollections(): Promise<MonitorCollection> {
  const raw = await apiClient.get<RawCollections>('/monitor/collections');
  return {
    totalKg: toNumber(raw.totals?.collectionKg),
    supplierCount: Array.isArray(raw.suppliers) ? raw.suppliers.length : 0,
    recent: (raw.suppliers ?? []).map((supplier) => ({
      route: supplier.supplierId,
      kg: toNumber(supplier.collectionKg),
    })),
  };
}

export async function getFinance(): Promise<MonitorFinance> {
  const raw = await apiClient.get<RawFinance>('/monitor/finance');
  return {
    cashOnHand: toNumber(raw.netCash),
    payables: toNumber(raw.payables),
    currency: 'LKR',
  };
}

export async function getInventory(): Promise<MonitorInventory> {
  const raw = await apiClient.get<RawInventory>('/monitor/inventory');
  return {
    receiptCount: toNumber(raw.receiptCount),
    issueCount: toNumber(raw.issueCount),
    purchaseValue: raw.purchaseValue,
    issueValue: raw.issueValue,
  };
}
