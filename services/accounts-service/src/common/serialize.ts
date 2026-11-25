import { randomUUID } from 'node:crypto';

export function moneyText(value: unknown, scale = 2): string {
  return Number(value ?? 0).toFixed(scale);
}

export function quantityText(value: unknown, scale = 3): string {
  return Number(value ?? 0).toFixed(scale);
}

export function toIso(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function toDateOnly(value: any): string | null {
  const iso = toIso(value);
  return iso ? iso.slice(0, 10) : null;
}

export function serializeAccount(row: any) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    accountType: row.accountType,
    normalBalance: row.normalBalance,
    parentId: row.parentId ?? null,
    isPostable: Boolean(row.isPostable),
    isControl: Boolean(row.isControl),
    partyType: row.partyType ?? null,
    active: Boolean(row.active),
    statement: row.statement ?? null,
    sectionId: row.sectionId ?? null,
    sortOrder: row.sortOrder ?? 0,
    cashFlowCategory: row.cashFlowCategory ?? null,
    isCashAccount: Boolean(row.isCashAccount),
    allowManualPosting: Boolean(row.allowManualPosting),
    deactivatedAt: toIso(row.deactivatedAt),
    version: row.version ?? 0,
  };
}

export function serializeJournalEntry(row: any, lines: any[] = []) {
  return {
    id: row.id,
    entryNo: row.entryNo,
    entryDate: toDateOnly(row.entryDate),
    periodId: row.periodId,
    description: row.description,
    sourceType: row.sourceType,
    sourceId: row.sourceId ?? null,
    sourceDrill: row.sourceId ? `/journal-entries/${row.id}/source` : null,
    status: row.status,
    reversalOfId: row.reversalOfId ?? null,
    reversalReason: row.reversalReason ?? null,
    postedBy: row.postedBy ?? null,
    postedAt: toIso(row.postedAt),
    idempotencyKey: row.idempotencyKey,
    currency: row.currency,
    lines: lines.map((line) => serializeJournalLine(line)),
    debitTotal: lines.reduce((sum, line) => sum + Number(line.debit ?? 0), 0).toFixed(2),
    creditTotal: lines.reduce((sum, line) => sum + Number(line.credit ?? 0), 0).toFixed(2),
    updatedAt: toIso(row.updatedAt),
  };
}

export function serializeJournalLine(row: any) {
  return {
    id: row.id,
    entryId: row.entryId,
    accountId: row.accountId,
    debit: moneyText(row.debit),
    credit: moneyText(row.credit),
    partyType: row.partyType ?? null,
    partyId: row.partyId ?? null,
    costCentreId: row.costCentreId ?? null,
    memo: row.memo ?? null,
    lineNo: row.lineNo,
  };
}

export function serializeBill(row: any, lines: any[] = []) {
  return {
    id: row.id,
    supplierId: row.supplierId,
    periodFrom: toDateOnly(row.periodFrom),
    periodTo: toDateOnly(row.periodTo),
    totalKg: quantityText(row.totalKg),
    grossAmount: moneyText(row.grossAmount),
    deductionsAmount: moneyText(row.deductionsAmount),
    netPayable: moneyText(row.netPayable),
    status: row.status,
    journalEntryId: row.journalEntryId ?? null,
    approvedBy: row.approvedBy ?? null,
    approvedAt: toIso(row.approvedAt),
    idempotencyKey: row.idempotencyKey,
    lines: lines.map((line) => ({
      id: line.id,
      collectionDate: toDateOnly(line.collectionDate),
      totalNetKg: quantityText(line.totalNetKg),
      ratePerKg: moneyText(line.ratePerKg),
      amount: moneyText(line.amount),
      dailyTotalId: line.dailyTotalId,
    })),
  };
}

export function serializePayrollRun(row: any, items: any[] = []) {
  return {
    id: row.id,
    periodFrom: toDateOnly(row.periodFrom),
    periodTo: toDateOnly(row.periodTo),
    runType: row.runType,
    status: row.status,
    grossTotal: moneyText(row.grossTotal),
    deductionTotal: moneyText(row.deductionTotal),
    netTotal: moneyText(row.netTotal),
    employerCost: moneyText(row.employerCost),
    approvedBy: row.approvedBy ?? null,
    approvedAt: toIso(row.approvedAt),
    journalEntryId: row.journalEntryId ?? null,
    idempotencyKey: row.idempotencyKey,
    items: items.map((item) => ({
      id: item.id,
      personId: item.personId,
      daysWorked: quantityText(item.daysWorked, 2),
      overtimeHours: quantityText(item.overtimeHours, 2),
      grossAmount: moneyText(item.grossAmount),
      epfEmployee: moneyText(item.epfEmployee),
      epfEmployer: moneyText(item.epfEmployer),
      etf: moneyText(item.etf),
      otherDeductions: moneyText(item.otherDeductions),
      netPay: moneyText(item.netPay),
      paymentStatus: item.paymentStatus,
      bankSnapshotMasked: item.bankSnapshotMasked ?? null,
    })),
  };
}

export function serializePayment(row: any) {
  return {
    id: row.id,
    batchId: row.batchId ?? null,
    payeeType: row.payeeType,
    payeeId: row.payeeId,
    amount: moneyText(row.amount),
    paymentMethod: row.paymentMethod,
    reference: row.reference ?? null,
    billId: row.billId ?? null,
    payrollItemId: row.payrollItemId ?? null,
    status: row.status,
    paidDate: toDateOnly(row.paidDate),
    paidBy: row.paidBy ?? null,
    journalEntryId: row.journalEntryId ?? null,
    idempotencyKey: row.idempotencyKey,
  };
}

export function maskedAccount(value: string): string {
  const text = value.trim();
  if (text.length <= 4) return '*'.repeat(text.length);
  return `${'*'.repeat(text.length - 4)}${text.slice(-4)}`;
}

export function exportReference(type: string, format: string): string {
  return `accounts/${type}/${format}/${randomUUID()}`;
}
