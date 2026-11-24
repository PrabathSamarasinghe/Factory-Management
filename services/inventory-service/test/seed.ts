import { createFakePrisma } from './fake-prisma';

const uuid = (suffix: string) => `00000000-0000-4000-8000-00000000${suffix}`;

export const IDS = {
  category: uuid('0010'),
  unitKg: uuid('0001'),
  unitPcs: uuid('0003'),
  item: uuid('0020'),
  slowItem: uuid('0021'),
  warehouse: uuid('0030'),
  location: uuid('0040'),
  locationTwo: uuid('0041'),
  vendor: uuid('0050'),
  actor: uuid('0060'),
  event: uuid('0070'),
  system: uuid('0000'),
};

export function createTestPrisma() {
  const prisma = createFakePrisma({
    unit: [
      { id: IDS.unitKg, code: 'kg', name: 'Kilogram' },
      { id: IDS.unitPcs, code: 'pcs', name: 'Pieces' },
    ],
    itemCategory: [
      {
        id: IDS.category,
        name: 'Made tea',
        parentId: null,
        createdAt: new Date('2026-11-01T00:00:00.000Z'),
      },
    ],
    item: [
      {
        id: IDS.item,
        sku: 'TEA-001',
        name: 'Made tea',
        categoryId: IDS.category,
        unitId: IDS.unitKg,
        barcode: null,
        reorderLevel: '5.000',
        reorderQty: '2.000',
        isBatchTracked: true,
        valuationMethod: 'WEIGHTED_AVG',
        active: true,
        createdAt: new Date('2026-11-01T00:00:00.000Z'),
        updatedAt: new Date('2026-11-01T00:00:00.000Z'),
      },
      {
        id: IDS.slowItem,
        sku: 'TEA-002',
        name: 'Low stock tea',
        categoryId: IDS.category,
        unitId: IDS.unitKg,
        barcode: null,
        reorderLevel: '100.000',
        reorderQty: '10.000',
        isBatchTracked: false,
        valuationMethod: 'WEIGHTED_AVG',
        active: true,
        createdAt: new Date('2026-11-01T00:00:00.000Z'),
        updatedAt: new Date('2026-11-01T00:00:00.000Z'),
      },
    ],
    warehouse: [
      {
        id: IDS.warehouse,
        name: 'Main warehouse',
        location: 'Nuwara Eliya',
        active: true,
        createdAt: new Date('2026-11-01T00:00:00.000Z'),
      },
    ],
    stockLocation: [
      {
        id: IDS.location,
        warehouseId: IDS.warehouse,
        code: 'MAIN',
        name: 'Main store',
        active: true,
      },
      {
        id: IDS.locationTwo,
        warehouseId: IDS.warehouse,
        code: 'SECOND',
        name: 'Second store',
        active: true,
      },
    ],
    vendor: [
      {
        id: IDS.vendor,
        name: 'SupplierOne',
        contact: null,
        phone: null,
        address: null,
        taxNo: null,
        bankDetailsEnc: null,
        bankDetailsMasked: null,
        createdAt: new Date('2026-11-01T00:00:00.000Z'),
        updatedAt: new Date('2026-11-01T00:00:00.000Z'),
      },
    ],
    stockBalance: [
      {
        itemId: IDS.item,
        locationId: IDS.location,
        qtyOnHand: '10.000',
        avgCost: '10.00',
        updatedAt: new Date('2026-11-01T00:00:00.000Z'),
      },
      {
        itemId: IDS.slowItem,
        locationId: IDS.location,
        qtyOnHand: '1.000',
        avgCost: '5.00',
        updatedAt: new Date('2026-11-01T00:00:00.000Z'),
      },
    ],
  });

  return { prisma };
}
