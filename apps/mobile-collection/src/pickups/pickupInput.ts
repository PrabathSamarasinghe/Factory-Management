import type { PickupPayload, ScanMethod } from '../types';
import { uuidV4 } from '../utils/uuid';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DECIMAL_PATTERN = /^\d+(\.\d{1,3})?$/;

export interface PickupDraft {
  tripId: string;
  supplierId: string;
  supplierRegNo: string;
  supplierBarcode?: string;
  routeStopId?: string;
  grossWeightKg: string;
  bagsCount: string;
  tareKg: string;
  moistureDeductionKg: string;
  scanMethod: ScanMethod;
  manualReason?: string;
  deviceId: string;
  recordedAtDevice?: string;
  gpsLat?: string;
  gpsLng?: string;
}

export interface PickupBuildOptions {
  now?: Date;
  createId?: () => string;
}

function requireUuid(value: string, label: string): string {
  const trimmed = value.trim().toLowerCase();
  if (!UUID_PATTERN.test(trimmed)) {
    throw new Error(`Enter a valid ${label}.`);
  }
  return trimmed;
}

function requireDecimal(value: string, label: string): string {
  const trimmed = value.trim();
  if (!DECIMAL_PATTERN.test(trimmed)) {
    throw new Error(`${label} must be a non-negative number with at most 3 decimal places.`);
  }
  return trimmed;
}

export function buildPickupPayload(
  draft: PickupDraft,
  options: PickupBuildOptions = {},
): PickupPayload {
  const tripId = requireUuid(draft.tripId, 'trip ID');
  const supplierId = requireUuid(draft.supplierId, 'supplier');
  const supplierRegNo = draft.supplierRegNo.trim();
  if (!supplierRegNo) {
    throw new Error('Supplier registration number is required.');
  }
  if (draft.routeStopId) {
    requireUuid(draft.routeStopId, 'route stop');
  }
  const bagsCount = Number(draft.bagsCount);
  if (!Number.isInteger(bagsCount) || bagsCount <= 0) {
    throw new Error('Bags count must be a positive whole number.');
  }
  const scanMethod = draft.scanMethod;
  if (scanMethod !== 'BARCODE' && scanMethod !== 'REG_NO') {
    throw new Error('Select a scan method.');
  }
  const manualReason = draft.manualReason?.trim() ?? '';
  if (scanMethod === 'REG_NO' && !manualReason) {
    throw new Error('A manual reason is required for registration number entry.');
  }
  const supplierBarcode = draft.supplierBarcode?.trim() ?? '';
  if (scanMethod === 'BARCODE' && !supplierBarcode) {
    throw new Error('Scan a barcode or use registration number entry.');
  }
  if (draft.gpsLat && !/^-?\d+(\.\d{1,6})?$/.test(draft.gpsLat.trim())) {
    throw new Error('Enter a valid GPS latitude.');
  }
  if (draft.gpsLng && !/^-?\d+(\.\d{1,6})?$/.test(draft.gpsLng.trim())) {
    throw new Error('Enter a valid GPS longitude.');
  }
  return {
    clientPickupId: (options.createId ?? uuidV4)(),
    tripId,
    supplierId,
    supplierRegNo,
    supplierBarcode: supplierBarcode || undefined,
    routeStopId: draft.routeStopId?.trim() || undefined,
    grossWeightKg: requireDecimal(draft.grossWeightKg, 'Gross weight'),
    bagsCount,
    tareKg: requireDecimal(draft.tareKg || '0', 'Tare weight'),
    moistureDeductionKg: requireDecimal(
      draft.moistureDeductionKg || '0',
      'Moisture deduction',
    ),
    recordedAtDevice: draft.recordedAtDevice ?? (options.now ?? new Date()).toISOString(),
    deviceId: requireUuid(draft.deviceId, 'device ID'),
    scanMethod,
    manualReason: manualReason || undefined,
    gpsLat: draft.gpsLat?.trim() || undefined,
    gpsLng: draft.gpsLng?.trim() || undefined,
  };
}
