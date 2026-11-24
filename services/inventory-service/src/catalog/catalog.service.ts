import { Injectable } from '@nestjs/common';
import {
  BusinessRuleError,
  ConflictError,
  EnvKeyProvider,
  NotFoundError,
  encryptString,
} from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import type { RequestContext } from '../common/request';
import {
  booleanValue,
  decimalText,
  money,
  optionalBoolean,
  optionalDateTime,
  optionalString,
  optionalUuid,
  quantity,
  requiredArray,
  requiredString,
  oneOf,
  uuid,
} from '../common/validation';
import {
  serializeCategory,
  serializeItem,
  serializeLocation,
  serializeUnit,
  serializeVendor,
  serializeWarehouse,
} from '../common/serializers';

const VALUATION_METHODS = ['WEIGHTED_AVG', 'FIFO', 'LIFO'] as const;

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listCategories() {
    const rows = await this.prisma.itemCategory.findMany({ orderBy: { name: 'asc' } });
    return rows.map(serializeCategory);
  }

  async createCategory(input: any, context: RequestContext) {
    const name = requiredString(input?.name, 'name');
    const parentId = optionalUuid(input?.parentId, 'parentId');
    if (parentId) await this.requireRow('itemCategory', parentId, 'Parent category not found.');

    const row = await this.prisma.itemCategory.create({
      data: { name, parentId } as any,
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'category.created',
      entityType: 'ItemCategory',
      entityId: row.id,
      details: { name },
    });
    return serializeCategory(row);
  }

  async updateCategory(id: string, input: any, context: RequestContext) {
    const categoryId = uuid(id, 'id');
    await this.requireRow('itemCategory', categoryId, 'Category not found.');
    const parentId = optionalUuid(input?.parentId, 'parentId');
    if (parentId === categoryId) throw new BusinessRuleError('A category cannot parent itself.');
    if (parentId) await this.requireRow('itemCategory', parentId, 'Parent category not found.');

    const row = await this.prisma.itemCategory.update({
      where: { id: categoryId },
      data: {
        name: input?.name === undefined ? undefined : requiredString(input.name, 'name'),
        parentId: input?.parentId === undefined ? undefined : (parentId ?? null),
      } as any,
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'category.updated',
      entityType: 'ItemCategory',
      entityId: categoryId,
    });
    return serializeCategory(row);
  }

  async listUnits() {
    const rows = await this.prisma.unit.findMany({ orderBy: { code: 'asc' } });
    return rows.map(serializeUnit);
  }

  async createUnit(input: any, context: RequestContext) {
    const code = requiredString(input?.code, 'code').toLowerCase();
    const name = requiredString(input?.name, 'name');
    const existing = await this.prisma.unit.findUnique({ where: { code } });
    if (existing) throw new ConflictError('A unit with this code already exists.');

    const row = await this.prisma.unit.create({ data: { code, name } as any });
    await this.audit.record({
      actorId: context.actorId,
      action: 'unit.created',
      entityType: 'Unit',
      entityId: row.id,
      details: { code },
    });
    return serializeUnit(row);
  }

  async listItems() {
    const [items, categories, units] = await Promise.all([
      this.prisma.item.findMany({ orderBy: { sku: 'asc' } }),
      this.prisma.itemCategory.findMany(),
      this.prisma.unit.findMany(),
    ]);
    const categoryNames = new Map(categories.map((row: any) => [row.id, row.name]));
    const unitCodes = new Map(units.map((row: any) => [row.id, row.code]));
    return items.map((row: any) =>
      serializeItem(row, categoryNames.get(row.categoryId), unitCodes.get(row.unitId)),
    );
  }

  async createItem(input: any, context: RequestContext) {
    const sku = requiredString(input?.sku, 'sku');
    const categoryId = uuid(input?.categoryId, 'categoryId');
    const unitId = uuid(input?.unitId, 'unitId');
    await this.requireRow('itemCategory', categoryId, 'Category not found.');
    await this.requireRow('unit', unitId, 'Unit not found.');
    const existing = await this.prisma.item.findUnique({ where: { sku } });
    if (existing) throw new ConflictError('An item with this SKU already exists.');

    const row = await this.prisma.item.create({
      data: {
        sku,
        name: requiredString(input?.name, 'name'),
        categoryId,
        unitId,
        barcode: optionalString(input?.barcode, 'barcode'),
        reorderLevel: quantity(input?.reorderLevel, 'reorderLevel'),
        reorderQty: quantity(input?.reorderQty, 'reorderQty'),
        isBatchTracked:
          input?.isBatchTracked === undefined
            ? false
            : booleanValue(input.isBatchTracked, 'isBatchTracked'),
        valuationMethod:
          input?.valuationMethod === undefined
            ? 'WEIGHTED_AVG'
            : oneOf(input.valuationMethod, VALUATION_METHODS, 'valuationMethod'),
        active: input?.active === undefined ? true : booleanValue(input.active, 'active'),
        updatedAt: new Date(),
      } as any,
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'item.created',
      entityType: 'Item',
      entityId: row.id,
      details: { sku, categoryId, unitId },
    });
    return this.serializeItemWithJoins(row);
  }

  async updateItem(id: string, input: any, context: RequestContext) {
    const itemId = uuid(id, 'id');
    await this.requireRow('item', itemId, 'Item not found.');
    const categoryId =
      input?.categoryId === undefined ? undefined : uuid(input.categoryId, 'categoryId');
    const unitId = input?.unitId === undefined ? undefined : uuid(input.unitId, 'unitId');
    if (categoryId) await this.requireRow('itemCategory', categoryId, 'Category not found.');
    if (unitId) await this.requireRow('unit', unitId, 'Unit not found.');

    const row = await this.prisma.item.update({
      where: { id: itemId },
      data: {
        name: input?.name === undefined ? undefined : requiredString(input.name, 'name'),
        barcode:
          input?.barcode === undefined ? undefined : optionalString(input.barcode, 'barcode'),
        categoryId,
        unitId,
        reorderLevel:
          input?.reorderLevel === undefined
            ? undefined
            : quantity(input.reorderLevel, 'reorderLevel'),
        reorderQty:
          input?.reorderQty === undefined ? undefined : quantity(input.reorderQty, 'reorderQty'),
        isBatchTracked:
          input?.isBatchTracked === undefined
            ? undefined
            : booleanValue(input.isBatchTracked, 'isBatchTracked'),
        valuationMethod:
          input?.valuationMethod === undefined
            ? undefined
            : oneOf(input.valuationMethod, VALUATION_METHODS, 'valuationMethod'),
        active: input?.active === undefined ? undefined : booleanValue(input.active, 'active'),
        updatedAt: new Date(),
      } as any,
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'item.updated',
      entityType: 'Item',
      entityId: itemId,
    });
    return this.serializeItemWithJoins(row);
  }

  async deactivateItem(id: string, context: RequestContext) {
    const itemId = uuid(id, 'id');
    await this.requireRow('item', itemId, 'Item not found.');
    const row = await this.prisma.item.update({
      where: { id: itemId },
      data: { active: false, updatedAt: new Date() } as any,
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'item.deactivated',
      entityType: 'Item',
      entityId: itemId,
    });
    return this.serializeItemWithJoins(row);
  }

  async listWarehouses() {
    const rows = await this.prisma.warehouse.findMany({ orderBy: { name: 'asc' } });
    return rows.map(serializeWarehouse);
  }

  async createWarehouse(input: any, context: RequestContext) {
    const name = requiredString(input?.name, 'name');
    const existing = await this.prisma.warehouse.findUnique({ where: { name } });
    if (existing) throw new ConflictError('A warehouse with this name already exists.');

    const row = await this.prisma.warehouse.create({
      data: {
        name,
        location: requiredString(input?.location, 'location'),
        active: input?.active === undefined ? true : booleanValue(input.active, 'active'),
      } as any,
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'warehouse.created',
      entityType: 'Warehouse',
      entityId: row.id,
      details: { name },
    });
    return serializeWarehouse(row);
  }

  async updateWarehouse(id: string, input: any, context: RequestContext) {
    const warehouseId = uuid(id, 'id');
    await this.requireRow('warehouse', warehouseId, 'Warehouse not found.');
    const row = await this.prisma.warehouse.update({
      where: { id: warehouseId },
      data: {
        name: input?.name === undefined ? undefined : requiredString(input.name, 'name'),
        location:
          input?.location === undefined ? undefined : requiredString(input.location, 'location'),
        active: input?.active === undefined ? undefined : booleanValue(input.active, 'active'),
      } as any,
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'warehouse.updated',
      entityType: 'Warehouse',
      entityId: warehouseId,
    });
    return serializeWarehouse(row);
  }

  async listLocations() {
    const rows = await this.prisma.stockLocation.findMany({ orderBy: { code: 'asc' } });
    return rows.map(serializeLocation);
  }

  async createLocation(input: any, context: RequestContext) {
    const warehouseId = uuid(input?.warehouseId, 'warehouseId');
    const code = requiredString(input?.code, 'code');
    await this.requireRow('warehouse', warehouseId, 'Warehouse not found.');
    const existing = await this.prisma.stockLocation.findUnique({
      where: { warehouseId_code: { warehouseId, code } },
    });
    if (existing)
      throw new ConflictError('A location with this code already exists in the warehouse.');

    const row = await this.prisma.stockLocation.create({
      data: {
        warehouseId,
        code,
        name: requiredString(input?.name, 'name'),
        active: input?.active === undefined ? true : booleanValue(input.active, 'active'),
      } as any,
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'location.created',
      entityType: 'StockLocation',
      entityId: row.id,
      details: { warehouseId, code },
    });
    return serializeLocation(row);
  }

  async listVendors() {
    const rows = await this.prisma.vendor.findMany({ orderBy: { name: 'asc' } });
    return rows.map(serializeVendor);
  }

  async createVendor(input: any, context: RequestContext) {
    const bank = await this.bankFields(input?.bankDetails);
    const row = await this.prisma.vendor.create({
      data: {
        name: requiredString(input?.name, 'name'),
        contact: optionalString(input?.contact, 'contact'),
        phone: optionalString(input?.phone, 'phone'),
        address: optionalString(input?.address, 'address'),
        taxNo: optionalString(input?.taxNo, 'taxNo'),
        ...bank,
      } as any,
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'vendor.created',
      entityType: 'Vendor',
      entityId: row.id,
      details: { name: input?.name, hasBankDetails: Boolean(bank.bankDetailsEnc) },
    });
    return serializeVendor(row);
  }

  async updateVendor(id: string, input: any, context: RequestContext) {
    const vendorId = uuid(id, 'id');
    await this.requireRow('vendor', vendorId, 'Vendor not found.');
    const bank = input?.bankDetails === undefined ? {} : await this.bankFields(input.bankDetails);
    const row = await this.prisma.vendor.update({
      where: { id: vendorId },
      data: {
        name: input?.name === undefined ? undefined : requiredString(input.name, 'name'),
        contact:
          input?.contact === undefined ? undefined : optionalString(input.contact, 'contact'),
        phone: input?.phone === undefined ? undefined : optionalString(input.phone, 'phone'),
        address:
          input?.address === undefined ? undefined : optionalString(input.address, 'address'),
        taxNo: input?.taxNo === undefined ? undefined : optionalString(input.taxNo, 'taxNo'),
        ...bank,
      } as any,
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'vendor.updated',
      entityType: 'Vendor',
      entityId: vendorId,
    });
    return serializeVendor(row);
  }

  private async serializeItemWithJoins(row: any) {
    const [category, unit] = await Promise.all([
      this.prisma.itemCategory.findUnique({ where: { id: row.categoryId } }),
      this.prisma.unit.findUnique({ where: { id: row.unitId } }),
    ]);
    return serializeItem(row, category?.name, unit?.code);
  }

  private async bankFields(value: unknown) {
    const text = optionalString(value, 'bankDetails');
    if (!text) return { bankDetailsEnc: undefined, bankDetailsMasked: undefined };
    const encrypted = await encryptString(text, EnvKeyProvider.fromEnv());
    return { bankDetailsEnc: Buffer.from(encrypted, 'utf8'), bankDetailsMasked: text.slice(-4) };
  }

  private async requireRow(model: string, id: string, message: string) {
    const row = await (this.prisma as any)[model].findUnique({ where: { id } });
    if (!row) throw new NotFoundError(message);
    return row;
  }
}
