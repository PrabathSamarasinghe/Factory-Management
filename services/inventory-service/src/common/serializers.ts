import { dateText, dateTimeText, decimalText } from './validation';

export function toIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return dateTimeText(value) || String(value);
}

export function serializeCategory(row: any) {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parentId ?? null,
    createdAt: toIso(row.createdAt),
  };
}

export function serializeUnit(row: any) {
  return { id: row.id, code: row.code, name: row.name };
}

export function serializeItem(row: any, categoryName?: string | null, unitCode?: string | null) {
  return {
    id: row.id,
    sku: row.sku,
    name: row.name,
    categoryId: row.categoryId,
    categoryName: categoryName ?? null,
    unitId: row.unitId,
    unitCode: unitCode ?? null,
    barcode: row.barcode ?? null,
    reorderLevel: decimalText(row.reorderLevel, 3),
    reorderQty: decimalText(row.reorderQty, 3),
    isBatchTracked: Boolean(row.isBatchTracked),
    valuationMethod: row.valuationMethod,
    active: Boolean(row.active),
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function serializeWarehouse(row: any) {
  return {
    id: row.id,
    name: row.name,
    location: row.location,
    active: Boolean(row.active),
    createdAt: toIso(row.createdAt),
  };
}

export function serializeLocation(row: any) {
  return {
    id: row.id,
    warehouseId: row.warehouseId,
    code: row.code,
    name: row.name,
    active: Boolean(row.active),
  };
}

export function serializeVendor(row: any) {
  return {
    id: row.id,
    name: row.name,
    contact: row.contact ?? null,
    phone: row.phone ?? null,
    address: row.address ?? null,
    taxNo: row.taxNo ?? null,
    bankDetailsMasked: row.bankDetailsMasked ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function serializeReceiptLine(row: any) {
  return {
    id: row.id,
    receiptId: row.receiptId,
    itemId: row.itemId,
    qty: decimalText(row.qty, 3),
    unitCost: decimalText(row.unitCost, 2),
    batchNo: row.batchNo ?? null,
    expiryDate: row.expiryDate ? dateText(row.expiryDate) : null,
  };
}

export function serializeReceipt(row: any, lines: any[] = []) {
  return {
    id: row.id,
    vendorId: row.vendorId,
    receiptDate: dateText(row.receiptDate),
    reference: row.reference,
    status: row.status,
    locationId: row.locationId,
    receivedById: row.receivedById ?? null,
    approvedById: row.approvedById ?? null,
    approvedAt: toIso(row.approvedAt),
    idempotencyKey: row.idempotencyKey ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    lines: lines.map(serializeReceiptLine),
  };
}

export function serializeIssueLine(row: any) {
  return {
    id: row.id,
    issueId: row.issueId,
    itemId: row.itemId,
    qty: decimalText(row.qty, 3),
    batchId: row.batchId ?? null,
  };
}

export function serializeIssue(row: any, lines: any[] = []) {
  return {
    id: row.id,
    issueDate: dateText(row.issueDate),
    issuedToType: row.issuedToType,
    issuedToId: row.issuedToId,
    purpose: row.purpose,
    status: row.status,
    issuedById: row.issuedById ?? null,
    approvedById: row.approvedById ?? null,
    approvedAt: toIso(row.approvedAt),
    idempotencyKey: row.idempotencyKey ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    lines: lines.map(serializeIssueLine),
  };
}

export function serializeTransferLine(row: any) {
  return {
    id: row.id,
    transferId: row.transferId,
    itemId: row.itemId,
    qty: decimalText(row.qty, 3),
    batchId: row.batchId ?? null,
  };
}

export function serializeTransfer(row: any, lines: any[] = []) {
  return {
    id: row.id,
    fromLocationId: row.fromLocationId,
    toLocationId: row.toLocationId,
    status: row.status,
    approvedById: row.approvedById ?? null,
    approvedAt: toIso(row.approvedAt),
    idempotencyKey: row.idempotencyKey ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
    lines: lines.map(serializeTransferLine),
  };
}

export function serializeAdjustment(row: any) {
  return {
    id: row.id,
    locationId: row.locationId,
    itemId: row.itemId,
    qtyDelta: decimalText(row.qtyDelta, 3),
    reason: row.reason,
    status: row.status,
    approvedById: row.approvedById ?? null,
    approvedAt: toIso(row.approvedAt),
    idempotencyKey: row.idempotencyKey ?? null,
    createdAt: toIso(row.createdAt),
    updatedAt: toIso(row.updatedAt),
  };
}

export function serializeStockTakeLine(row: any) {
  return {
    id: row.id,
    takeId: row.takeId,
    itemId: row.itemId,
    systemQty: decimalText(row.systemQty, 3),
    countedQty: decimalText(row.countedQty, 3),
    variance: decimalText(row.variance, 3),
    applied: Boolean(row.applied),
  };
}

export function serializeStockTake(row: any, lines: any[] = []) {
  return {
    id: row.id,
    locationId: row.locationId,
    status: row.status,
    startedAt: toIso(row.startedAt),
    completedAt: toIso(row.completedAt),
    idempotencyKey: row.idempotencyKey ?? null,
    createdAt: toIso(row.createdAt),
    lines: lines.map(serializeStockTakeLine),
  };
}

export function serializeBatch(row: any) {
  return {
    id: row.id,
    itemId: row.itemId,
    batchNo: row.batchNo,
    receivedOn: toIso(row.receivedOn),
    expiryDate: toIso(row.expiryDate),
    qtyRemaining: decimalText(row.qtyRemaining, 3),
  };
}

export function serializeBalance(row: any) {
  return {
    itemId: row.itemId,
    locationId: row.locationId,
    qtyOnHand: decimalText(row.qtyOnHand, 3),
    avgCost: decimalText(row.avgCost, 2),
    updatedAt: toIso(row.updatedAt),
  };
}

export function serializeMovement(row: any) {
  return {
    id: row.id,
    itemId: row.itemId,
    locationId: row.locationId,
    batchId: row.batchId ?? null,
    movementType: row.movementType,
    qty: decimalText(row.qty, 3),
    unitCost: decimalText(row.unitCost, 2),
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    reference: row.reference,
    occurredAt: toIso(row.occurredAt),
    createdBy: row.createdBy ?? null,
    createdAt: toIso(row.createdAt),
  };
}

export function serializeAlert(item: any, balance: any) {
  return {
    itemId: item.id,
    sku: item.sku,
    name: item.name,
    locationId: balance.locationId,
    qtyOnHand: decimalText(balance.qtyOnHand, 3),
    reorderLevel: decimalText(item.reorderLevel, 3),
    reorderQty: decimalText(item.reorderQty, 3),
  };
}

export function serializeValuation(row: any) {
  const qty = Number(row.qtyOnHand ?? 0);
  const avgCost = Number(row.avgCost ?? 0);
  return {
    itemId: row.itemId,
    locationId: row.locationId,
    qtyOnHand: decimalText(qty, 3),
    avgCost: decimalText(avgCost, 2),
    totalValue: decimalText(qty * avgCost, 2),
  };
}
