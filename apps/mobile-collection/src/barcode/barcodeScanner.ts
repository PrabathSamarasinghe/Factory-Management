export interface BarcodeScanResult {
  value: string;
  format?: string;
}

export type BarcodeScanner = () => Promise<BarcodeScanResult | null>;

export class BarcodeScannerUnavailableError extends Error {
  constructor() {
    super('Barcode scanning is not available on this build.');
    this.name = 'BarcodeScannerUnavailableError';
  }
}

let scanner: BarcodeScanner | null = null;

export function registerBarcodeScanner(next: BarcodeScanner | null): void {
  scanner = next;
}

export function hasBarcodeScanner(): boolean {
  return Boolean(scanner);
}

export async function scanSupplierBarcode(): Promise<BarcodeScanResult> {
  if (!scanner) {
    throw new BarcodeScannerUnavailableError();
  }
  const result = await scanner();
  const value = result?.value.trim() ?? '';
  if (!value) {
    throw new Error('No barcode was scanned.');
  }
  return { value, format: result?.format };
}
