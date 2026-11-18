import {
  BarcodeScannerUnavailableError,
  registerBarcodeScanner,
  scanSupplierBarcode,
} from '../src/barcode/barcodeScanner';
import { buildPickupPayload } from '../src/pickups/pickupInput';
import type { PickupDraft } from '../src/pickups/pickupInput';

const deviceId = '22222222-2222-4222-8222-222222222222';
const now = new Date('2026-11-18T08:00:00.000Z');

const draft: PickupDraft = {
  tripId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  supplierId: '11111111-1111-4111-8111-111111111111',
  supplierRegNo: 'REG-1001',
  grossWeightKg: '120.500',
  bagsCount: '12',
  tareKg: '2.000',
  moistureDeductionKg: '1.500',
  scanMethod: 'REG_NO',
  manualReason: 'Barcode label damaged',
  deviceId,
};

describe('manual pickup entry', () => {
  it('requires a manual reason for registration-number entry', () => {
    expect(() =>
      buildPickupPayload({ ...draft, manualReason: '' }, { now }),
    ).toThrow('manual reason is required');
  });

  it('builds a complete REG_NO payload with a generated client id', () => {
    const payload = buildPickupPayload(draft, {
      now,
      createId: () => 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    });
    expect(payload).toMatchObject({
      clientPickupId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      scanMethod: 'REG_NO',
      manualReason: 'Barcode label damaged',
      grossWeightKg: '120.500',
      bagsCount: 12,
      recordedAtDevice: now.toISOString(),
      deviceId,
    });
  });

  it('requires a barcode value for BARCODE entry and a positive bags count', () => {
    expect(() =>
      buildPickupPayload({ ...draft, scanMethod: 'BARCODE', manualReason: undefined }, { now }),
    ).toThrow('Scan a barcode');
    expect(() =>
      buildPickupPayload({ ...draft, bagsCount: '0' }, { now }),
    ).toThrow('Bags count must be a positive whole number.');
  });

  it('uses an injectable scanner while manual entry remains available', async () => {
    registerBarcodeScanner(async () => ({ value: ' BC-1001 ', format: 'CODE_128' }));
    await expect(scanSupplierBarcode()).resolves.toEqual({
      value: 'BC-1001',
      format: 'CODE_128',
    });

    registerBarcodeScanner(null);
    await expect(scanSupplierBarcode()).rejects.toBeInstanceOf(
      BarcodeScannerUnavailableError,
    );
    expect(() => buildPickupPayload(draft, { now })).not.toThrow();
  });
});
