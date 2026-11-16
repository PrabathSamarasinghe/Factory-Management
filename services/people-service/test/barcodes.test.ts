import { describe, expect, it } from 'vitest';
import { NotFoundError } from '@galatura/platform-kit';
import { BarcodesService } from '../src/barcodes/barcodes.service';
import { BarcodesController } from '../src/barcodes/barcodes.controller';

class FakePersonsService {
  constructor(private readonly person: any) {}
  async getPersonById() {
    return this.person;
  }
}

const supplierPerson = {
  id: 'p1',
  fullName: 'Sunil Silva',
  preferredName: 'Sunil',
  phonePrimary: '0712345678',
  supplierDetails: {
    supplierCode: 'SUP-260001A',
    supplierRegNo: '260001A',
    supplierRegNoNormalized: '260001A',
    barcodeValue: '260001A',
    estateName: 'Green Estate',
    collectionPoint: 'CP-1',
  },
};

describe('BarcodesService', () => {
  const service = new BarcodesService();

  it('generates a Code128 barcode as SVG', async () => {
    const svg = await service.generateSvg('260001A', 'code128');
    expect(svg).toContain('<svg');
    expect(svg).toContain('<path');
  });

  it('generates a QR code as SVG', async () => {
    const svg = await service.generateSvg('260001A', 'qrcode');
    expect(svg).toContain('<svg');
  });

  it('generates a PNG buffer with a valid PNG signature', async () => {
    const png = await service.generatePng('260001A', 'code128');
    expect(Buffer.isBuffer(png)).toBe(true);
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });
});

describe('BarcodesController', () => {
  it('returns a printable card with both barcode and QR assets', async () => {
    const controller = new BarcodesController(
      new BarcodesService(),
      new FakePersonsService(supplierPerson) as any,
    );

    const card = await controller.getSupplierBarcodeCard('p1');
    expect(card.supplierRegNo).toBe('260001A');
    expect(card.barcodeValue).toBe('260001A');
    expect(card.fullName).toBe('Sunil Silva');
    expect(card.estateName).toBe('Green Estate');
    expect(card.svgBarcode).toContain('<svg');
    expect(card.svgQr).toContain('<svg');
  });

  it('rejects barcode cards for non-suppliers', async () => {
    const controller = new BarcodesController(
      new BarcodesService(),
      new FakePersonsService({ id: 'p2', supplierDetails: null }) as any,
    );

    await expect(controller.getSupplierBarcodeCard('p2')).rejects.toThrow(NotFoundError);
  });
});
