import { dateText, decimalText } from './validation';

export function moneyText(value: unknown): string {
  return decimalText(value, 2);
}

export function quantityText(value: unknown): string {
  return decimalText(value, 3);
}

export function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return dateTimeTextSafe(value);
}

export function serializeDaily(row: any) {
  return {
    date: dateText(row?.date),
    attendancePresent: Number(row?.attendancePresent ?? 0),
    attendanceLate: Number(row?.attendanceLate ?? 0),
    attendanceAbsent: Number(row?.attendanceAbsent ?? 0),
    tripsStarted: Number(row?.tripsStarted ?? 0),
    tripsEnded: Number(row?.tripsEnded ?? 0),
    kgCollected: quantityText(row?.kgCollected),
    kgWeighed: quantityText(row?.kgWeighed),
    suppliersPaid: moneyText(row?.suppliersPaidDecimal),
    smsQueued: Number(row?.smsQueued ?? 0),
    smsSent: Number(row?.smsSent ?? 0),
    smsDelivered: Number(row?.smsDelivered ?? 0),
    smsFailed: Number(row?.smsFailed ?? 0),
  };
}

export function serializeAttendance(row: any) {
  return {
    date: dateText(row?.date),
    attendancePresent: Number(row?.attendancePresent ?? 0),
    attendanceLate: Number(row?.attendanceLate ?? 0),
    attendanceAbsent: Number(row?.attendanceAbsent ?? 0),
  };
}

export function serializeTrip(row: any) {
  return {
    tripId: row.tripId,
    routeId: row.routeId ?? null,
    lorryId: row.lorryId ?? null,
    status: row.status,
    startedAt: toIso(row.startedAt),
    endedAt: toIso(row.endedAt),
    lastEventId: row.lastEventId,
  };
}

export function serializeSupplier(row: any) {
  return {
    supplierId: row.supplierId,
    date: dateText(row.date),
    collectionKg: quantityText(row.collectionKg),
    collectionBags: Number(row.collectionBags ?? 0),
    paidAmount: moneyText(row.paidAmount),
  };
}

export function serializeFinance(row: any) {
  const cashIn = Number(row?.cashIn ?? 0);
  const cashOut = Number(row?.cashOut ?? 0);
  return {
    cashIn: moneyText(cashIn),
    cashOut: moneyText(cashOut),
    payables: moneyText(row?.payables),
    journalPostedTotal: moneyText(row?.journalPostedTotal),
    payrollApprovedTotal: moneyText(row?.payrollApprovedTotal),
    paymentPaidTotal: moneyText(row?.paymentPaidTotal),
    netCash: moneyText(cashIn - cashOut),
  };
}

export function serializeInventory(row: any) {
  return {
    purchaseQty: quantityText(row?.purchaseQty),
    purchaseValue: moneyText(row?.purchaseValue),
    issueQty: quantityText(row?.issueQty),
    issueValue: moneyText(row?.issueValue),
    receiptCount: Number(row?.receiptCount ?? 0),
    issueCount: Number(row?.issueCount ?? 0),
  };
}

function dateTimeTextSafe(value: unknown): string {
  const parsed = new Date(String(value ?? ''));
  if (Number.isNaN(parsed.getTime())) return String(value ?? '');
  return parsed.toISOString();
}
