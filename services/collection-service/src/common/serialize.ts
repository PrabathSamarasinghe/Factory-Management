export function decimalText(value: unknown, scale = 3): string {
  return Number(value ?? 0).toFixed(scale);
}

export function toIso(value: any): string | null {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  return String(value);
}

export function serializePickup(row: any) {
  return {
    id: row.id,
    clientPickupId: row.clientPickupId,
    tripId: row.tripId,
    routeStopId: row.routeStopId ?? null,
    supplierId: row.supplierId,
    supplierRegNo: row.supplierRegNo,
    supplierBarcode: row.supplierBarcode ?? null,
    grossWeightKg: decimalText(row.grossWeightKg),
    bagsCount: row.bagsCount,
    tareKg: decimalText(row.tareKg),
    moistureDeductionKg: decimalText(row.moistureDeductionKg),
    qualityGrade: row.qualityGrade ?? null,
    recordedBy: row.recordedBy,
    recordedAtDevice: toIso(row.recordedAtDevice),
    receivedAtServer: toIso(row.receivedAtServer),
    gpsLat: row.gpsLat === null || row.gpsLat === undefined ? null : decimalText(row.gpsLat, 6),
    gpsLng: row.gpsLng === null || row.gpsLng === undefined ? null : decimalText(row.gpsLng, 6),
    scanMethod: row.scanMethod,
    manualReason: row.manualReason ?? null,
    status: row.status,
    supersedesId: row.supersedesId ?? null,
    deviceId: row.deviceId,
    version: row.version,
    updatedAt: toIso(row.updatedAt),
  };
}

export function serializeWeighing(row: any) {
  return {
    id: row.id,
    clientWeighingId: row.clientWeighingId,
    tripId: row.tripId,
    supplierId: row.supplierId,
    pickupId: row.pickupId ?? null,
    netWeightKg: decimalText(row.netWeightKg),
    grossWeightKg: decimalText(row.grossWeightKg),
    tareKg: decimalText(row.tareKg),
    bagsCount: row.bagsCount,
    deductionsKg: decimalText(row.deductionsKg),
    qualityGrade: row.qualityGrade ?? null,
    scaleId: row.scaleId,
    weighedBy: row.weighedBy,
    weighedAt: toIso(row.weighedAt),
    status: row.status,
    version: row.version,
    updatedAt: toIso(row.updatedAt),
  };
}

export function serializeTotal(row: any) {
  return {
    id: row.id,
    supplierId: row.supplierId,
    collectionDate: toIso(row.collectionDate)?.slice(0, 10),
    totalNetKg: decimalText(row.totalNetKg),
    totalBags: row.totalBags,
    tripId: row.tripId,
    finalized: row.finalized,
    finalizedAt: toIso(row.finalizedAt),
    finalizedBy: row.finalizedBy ?? null,
    smsStatus: row.smsStatus,
    smsMessageId: row.smsMessageId ?? null,
    version: row.version,
    updatedAt: toIso(row.updatedAt),
  };
}

export function serializeDiscrepancy(row: any) {
  return {
    id: row.id,
    pickupId: row.pickupId,
    weighingId: row.weighingId,
    fieldKg: decimalText(row.fieldKg),
    factoryKg: decimalText(row.factoryKg),
    diffKg: decimalText(row.diffKg),
    diffPct: decimalText(row.diffPct),
    status: row.status,
    resolvedBy: row.resolvedBy ?? null,
    note: row.note ?? null,
    version: row.version,
    updatedAt: toIso(row.updatedAt),
  };
}
