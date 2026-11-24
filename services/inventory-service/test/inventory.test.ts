import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { createEvent } from '@galatura/platform-kit';
import { AuditService } from '../src/audit/audit.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { CatalogService } from '../src/catalog/catalog.service';
import { CatalogController } from '../src/catalog/catalog.controller';
import { StockService } from '../src/stock/stock.service';
import { StockController } from '../src/stock/stock.controller';
import { EventsService } from '../src/events/events.service';
import { EventsController } from '../src/events/events.controller';
import { HealthController } from '../src/health.controller';
import { createTestPrisma, IDS } from './seed';

const NOW = new Date('2026-11-24T10:00:00.000Z');
const context = { actorId: IDS.actor };
const approved = { approvedAt: NOW.toISOString() };

function request(permissions: string[] = [], headers: Record<string, string> = {}): any {
  return {
    headers: { 'x-permissions': JSON.stringify(permissions), ...headers },
    ip: '127.0.0.1',
  };
}

function buildServices() {
  const seed = createTestPrisma();
  const audit = new AuditService(seed.prisma as any);
  const outbox = new OutboxService(seed.prisma as any);
  const catalog = new CatalogService(seed.prisma as any, audit);
  const stock = new StockService(seed.prisma as any, audit, outbox);
  const events = new EventsService(seed.prisma as any);
  const catalogController = new CatalogController(catalog);
  const stockController = new StockController(stock);
  const eventsController = new EventsController(events);
  return {
    ...seed,
    audit,
    outbox,
    catalog,
    stock,
    events,
    catalogController,
    stockController,
    eventsController,
  };
}

async function draftReceipt(stock: StockService, key: string, qty = '10.000', unitCost = '20.00') {
  return stock.createReceipt(
    {
      vendorId: IDS.vendor,
      receiptDate: '2026-11-24',
      reference: `GR-${key}`,
      idempotencyKey: key,
      lines: [{ itemId: IDS.item, qty, unitCost, batchNo: `B-${key}` }],
    },
    context,
  );
}

beforeAll(() => {
  process.env.PLATFORM_MASTER_KEY = Buffer.alloc(32, 7).toString('base64');
});

describe('inventory-service foundation', () => {
  it('reports health and enforces catalog permissions', () => {
    expect(new HealthController().health()).toEqual({
      status: 'ok',
      service: 'inventory-service',
    });

    const { catalogController } = buildServices();
    expect(() => catalogController.items(request())).toThrow(/Missing required permission/);
    expect(() => catalogController.createItem(request(['item:read']), {})).toThrow(/item:create/);
  });

  it('enforces stock report permissions', () => {
    const { stockController } = buildServices();
    expect(() => stockController.valuation(request())).toThrow(/inventory:report/);
    expect(() => stockController.approveIssue(request(['issue:read']), IDS.item, {})).toThrow(
      /issue:approve/,
    );
  });

  it('creates, updates, and lists categories', async () => {
    const { catalog } = buildServices();
    const created = await catalog.createCategory({ name: 'Fertilizer' }, context);
    expect(created.name).toBe('Fertilizer');
    expect(created.parentId).toBeNull();

    const updated = await catalog.updateCategory(
      created.id,
      { name: 'Fertilizers', parentId: IDS.category },
      context,
    );
    expect(updated.name).toBe('Fertilizers');
    expect(updated.parentId).toBe(IDS.category);
    expect((await catalog.listCategories()).map((row: any) => row.name)).toContain('Fertilizers');
  });

  it('creates units and rejects duplicate codes', async () => {
    const { catalog } = buildServices();
    const created = await catalog.createUnit({ code: 'LITRE', name: 'Litre' }, context);
    expect(created.code).toBe('litre');
    await expect(catalog.createUnit({ code: 'litre', name: 'Litre' }, context)).rejects.toThrow(
      /already exists/,
    );
  });

  it('creates and updates items with joined category name and unit code', async () => {
    const { catalog } = buildServices();
    const created = await catalog.createItem(
      {
        sku: 'FERT-001',
        name: 'Urea',
        categoryId: IDS.category,
        unitId: IDS.unitKg,
        reorderLevel: '12.500',
        reorderQty: '5.000',
      },
      context,
    );
    expect(created.categoryName).toBe('Made tea');
    expect(created.unitCode).toBe('kg');
    expect(created.reorderLevel).toBe('12.500');

    const updated = await catalog.updateItem(created.id, { name: 'Urea 46%' }, context);
    expect(updated.name).toBe('Urea 46%');
    expect(updated.categoryName).toBe('Made tea');
  });

  it('deactivates items', async () => {
    const { catalog, prisma } = buildServices();
    const deactivated = await catalog.deactivateItem(IDS.item, context);
    expect(deactivated.active).toBe(false);
    expect(prisma.__stores.item.find((row: any) => row.id === IDS.item).active).toBe(false);
  });

  it('manages warehouses and locations', async () => {
    const { catalog } = buildServices();
    const warehouse = await catalog.createWarehouse(
      { name: 'North warehouse', location: 'Kandy' },
      context,
    );
    const updated = await catalog.updateWarehouse(warehouse.id, { active: false }, context);
    expect(updated.active).toBe(false);

    const location = await catalog.createLocation(
      { warehouseId: warehouse.id, code: 'NORTH-1', name: 'North rack' },
      context,
    );
    expect(location.active).toBe(true);
    expect((await catalog.listLocations()).some((row: any) => row.id === location.id)).toBe(true);
    await expect(
      catalog.createLocation(
        { warehouseId: warehouse.id, code: 'NORTH-1', name: 'Duplicate' },
        context,
      ),
    ).rejects.toThrow(/already exists/);
  });

  it('encrypts vendor bank details and only returns the masked value', async () => {
    const { catalog, prisma } = buildServices();
    const vendor = await catalog.createVendor(
      { name: 'Tea Supplier', bankDetails: '1234567890' },
      context,
    );
    expect(vendor.bankDetailsMasked).toBe('7890');
    expect(vendor).not.toHaveProperty('bankDetailsEnc');
    expect(vendor).not.toHaveProperty('bankDetails');

    const stored = prisma.__stores.vendor.find((row: any) => row.id === vendor.id);
    expect(Buffer.from(stored.bankDetailsEnc).toString('utf8')).not.toContain('1234567890');
    expect(Buffer.isBuffer(stored.bankDetailsEnc)).toBe(true);

    const updated = await catalog.updateVendor(vendor.id, { bankDetails: '999988887777' }, context);
    expect(updated.bankDetailsMasked).toBe('7777');
  });

  it('returns an existing draft when create idempotency keys repeat', async () => {
    const { stock, prisma } = buildServices();
    const first = await draftReceipt(stock, 'duplicate-create');
    const second = await draftReceipt(stock, 'duplicate-create');
    expect(second.id).toBe(first.id);
    expect(second.status).toBe('DRAFT');
    expect(prisma.__stores.goodsReceipt).toHaveLength(1);
    expect(prisma.__stores.goodsReceiptLine).toHaveLength(1);
  });

  it('accepts the idempotency header through the controller', async () => {
    const { stockController, prisma } = buildServices();
    const result = await stockController.createReceipt(
      request(['receipt:create'], { 'idempotency-key': 'header-key' }),
      {
        vendorId: IDS.vendor,
        receiptDate: '2026-11-24',
        lines: [{ itemId: IDS.item, qty: '1.000', unitCost: '10.00' }],
      },
    );
    expect((await result.data).idempotencyKey).toBe('header-key');
    expect(prisma.__stores.goodsReceipt).toHaveLength(1);
  });

  it('applies weighted average cost when a receipt is approved', async () => {
    const { stock, prisma } = buildServices();
    const receipt = await draftReceipt(stock, 'weighted');
    const posted = await stock.approveReceipt(receipt.id, approved, context);
    expect(posted.status).toBe('APPROVED');
    expect(posted.approvedAt).toBe(NOW.toISOString());

    const balance = prisma.__stores.stockBalance.find(
      (row: any) => row.itemId === IDS.item && row.locationId === IDS.location,
    );
    expect(balance.qtyOnHand).toBe('20.000');
    expect(balance.avgCost).toBe('15.00');
  });

  it('writes a receipt movement and purchase event on approval', async () => {
    const { stock, prisma } = buildServices();
    const receipt = await draftReceipt(stock, 'purchase-event');
    await stock.approveReceipt(receipt.id, approved, context);

    const movement = prisma.__stores.stockMovement[0];
    expect(movement.movementType).toBe('RECEIPT');
    expect(movement.qty).toBe('10.000');
    expect(movement.unitCost).toBe('20.00');
    expect(movement.referenceType).toBe('RECEIPT');
    expect(movement.referenceId).toBe(receipt.id);
    expect(movement.reference).toBeTruthy();
    expect(movement.occurredAt.toISOString()).toBe(NOW.toISOString());
    expect(movement.createdBy).toBe(IDS.actor);

    const envelope = prisma.__stores.outboxEvent[0].envelope;
    expect(envelope.type).toBe('inventory.purchase.received');
    expect(envelope.version).toBe(1);
    expect(envelope.producer).toBe('inventory-service');
    expect(envelope.payload).toEqual({
      receiptId: receipt.id,
      vendorId: IDS.vendor,
      receivedDate: '2026-11-24',
      reference: 'GR-purchase-event',
      lines: [
        {
          itemId: IDS.item,
          qty: '10.000',
          unitCost: '20.00',
          value: '200.00',
          inventoryAccountCode: '1210',
          payableAccountCode: '2050',
        },
      ],
      totalValue: '200.00',
      approvedBy: IDS.actor,
      approvedAt: NOW.toISOString(),
    });

    const batch = prisma.__stores.stockBatch[0];
    expect(batch.batchNo).toBe('B-purchase-event');
    expect(batch.qtyRemaining).toBe('10.000');
  });

  it('is idempotent when a receipt approval is retried', async () => {
    const { stock, prisma } = buildServices();
    const receipt = await draftReceipt(stock, 'approve-twice');
    const first = await stock.approveReceipt(
      receipt.id,
      { ...approved, idempotencyKey: 'appr-1' },
      context,
    );
    const second = await stock.approveReceipt(
      receipt.id,
      { ...approved, idempotencyKey: 'appr-1' },
      context,
    );
    expect(second.id).toBe(first.id);
    expect(second.status).toBe('APPROVED');
    expect(prisma.__stores.stockMovement).toHaveLength(1);
    expect(prisma.__stores.outboxEvent).toHaveLength(1);
  });

  it('rejects an issue when stock is insufficient', async () => {
    const { stock } = buildServices();
    const issue = await stock.createIssue(
      {
        issueDate: '2026-11-24',
        issuedToType: 'FARM',
        issuedToId: IDS.warehouse,
        purpose: 'Field application',
        lines: [{ itemId: IDS.slowItem, qty: '2.000' }],
      },
      context,
    );
    await expect(stock.approveIssue(issue.id, approved, context)).rejects.toThrow(
      /Insufficient stock/,
    );
  });

  it('decrements balances and writes an issue event on approval', async () => {
    const { stock, prisma } = buildServices();
    const issue = await stock.createIssue(
      {
        issueDate: '2026-11-24',
        issuedToType: 'FARM',
        issuedToId: IDS.warehouse,
        purpose: 'Field application',
        lines: [{ itemId: IDS.item, qty: '4.000' }],
      },
      context,
    );
    const posted = await stock.approveIssue(issue.id, approved, context);
    expect(posted.status).toBe('APPROVED');

    const balance = prisma.__stores.stockBalance.find(
      (row: any) => row.itemId === IDS.item && row.locationId === IDS.location,
    );
    expect(balance.qtyOnHand).toBe('6.000');
    expect(balance.avgCost).toBe('10.00');
    expect(prisma.__stores.stockMovement[0].qty).toBe('-4.000');
    expect(prisma.__stores.stockMovement[0].movementType).toBe('ISSUE');

    const envelope = prisma.__stores.outboxEvent[0].envelope;
    expect(envelope.type).toBe('inventory.issue.posted');
    expect(envelope.payload.lines[0]).toEqual({
      itemId: IDS.item,
      qty: '4.000',
      unitCost: '10.00',
      value: '40.00',
      expenseAccountCode: '5030',
      inventoryAccountCode: '1210',
    });
    expect(envelope.payload.totalValue).toBe('40.00');
    expect(envelope.payload.approvedBy).toBe(IDS.actor);
    expect(envelope.payload.issueDate).toBe('2026-11-24');
  });

  it('uses the system UUID fallback for event identifiers without an actor', async () => {
    const { stock, prisma } = buildServices();
    const receipt = await draftReceipt(stock, 'system-actor');
    await stock.approveReceipt(receipt.id, approved, {});
    expect(prisma.__stores.outboxEvent[0].envelope.payload.approvedBy).toBe(IDS.system);
    expect(prisma.__stores.outboxEvent[0].envelope.actor).toEqual({ type: 'SYSTEM', id: null });
  });

  it('creates two movements when a transfer is approved', async () => {
    const { stock, prisma } = buildServices();
    const transfer = await stock.createTransfer(
      {
        fromLocationId: IDS.location,
        toLocationId: IDS.locationTwo,
        idempotencyKey: 'transfer-1',
        lines: [{ itemId: IDS.item, qty: '3.000' }],
      },
      context,
    );
    const posted = await stock.approveTransfer(transfer.id, approved, context);
    expect(posted.status).toBe('APPROVED');

    const types = prisma.__stores.stockMovement.map((row: any) => row.movementType);
    expect(types).toEqual(['TRANSFER_OUT', 'TRANSFER_IN']);
    expect(prisma.__stores.stockMovement.map((row: any) => row.qty)).toEqual(['-3.000', '3.000']);

    const source = prisma.__stores.stockBalance.find(
      (row: any) => row.itemId === IDS.item && row.locationId === IDS.location,
    );
    const destination = prisma.__stores.stockBalance.find(
      (row: any) => row.itemId === IDS.item && row.locationId === IDS.locationTwo,
    );
    expect(source.qtyOnHand).toBe('7.000');
    expect(destination.qtyOnHand).toBe('3.000');
    expect(destination.avgCost).toBe('10.00');
  });

  it('rejects transfers with the same source and destination', async () => {
    const { stock } = buildServices();
    await expect(
      stock.createTransfer(
        {
          fromLocationId: IDS.location,
          toLocationId: IDS.location,
          lines: [{ itemId: IDS.item, qty: '1.000' }],
        },
        context,
      ),
    ).rejects.toThrow(/must differ/);
  });

  it('approves positive adjustments with an optional unit cost', async () => {
    const { stock, prisma } = buildServices();
    const adjustment = await stock.createAdjustment(
      {
        locationId: IDS.location,
        itemId: IDS.item,
        qtyDelta: '2.000',
        reason: 'Damaged bags returned',
      },
      context,
    );
    const posted = await stock.approveAdjustment(
      adjustment.id,
      { ...approved, unitCost: '12.00' },
      context,
    );
    expect(posted.status).toBe('APPROVED');
    const balance = prisma.__stores.stockBalance.find(
      (row: any) => row.itemId === IDS.item && row.locationId === IDS.location,
    );
    expect(balance.qtyOnHand).toBe('12.000');
    expect(balance.avgCost).toBe('10.33');
    expect(prisma.__stores.stockMovement[0].qty).toBe('2.000');
    expect(prisma.__stores.stockMovement[0].referenceType).toBe('ADJUSTMENT');
  });

  it('approves negative adjustments and rejects overdrafts', async () => {
    const { stock, prisma } = buildServices();
    const adjustment = await stock.createAdjustment(
      {
        locationId: IDS.location,
        itemId: IDS.item,
        qtyDelta: '-3.000',
        reason: 'Spoilage',
      },
      context,
    );
    await stock.approveAdjustment(adjustment.id, approved, context);
    const balance = prisma.__stores.stockBalance.find(
      (row: any) => row.itemId === IDS.item && row.locationId === IDS.location,
    );
    expect(balance.qtyOnHand).toBe('7.000');

    const tooLarge = await stock.createAdjustment(
      { locationId: IDS.location, itemId: IDS.item, qtyDelta: '-50.000', reason: 'Spoilage' },
      context,
    );
    await expect(stock.approveAdjustment(tooLarge.id, approved, context)).rejects.toThrow(
      /Insufficient stock/,
    );
    expect(prisma.__stores.stockMovement).toHaveLength(1);
  });

  it('computes stock take variance when adding a line', async () => {
    const { stock } = buildServices();
    const take = await stock.createStockTake({ locationId: IDS.location }, context);
    const line = await stock.addStockTakeLine(
      take.id,
      { itemId: IDS.item, systemQty: '10.000', countedQty: '7.500' },
      context,
    );
    expect(line.variance).toBe('-2.500');
    expect(line.applied).toBe(false);
    await expect(
      stock.addStockTakeLine(
        take.id,
        { itemId: IDS.item, systemQty: '10.000', countedQty: '7.500' },
        context,
      ),
    ).rejects.toThrow(/already has a stock take line/);
  });

  it('applies stock take variances on completion', async () => {
    const { stock, prisma } = buildServices();
    const take = await stock.createStockTake(
      { locationId: IDS.location, startedAt: '2026-11-24T08:00:00.000Z' },
      context,
    );
    await stock.addStockTakeLine(
      take.id,
      { itemId: IDS.item, systemQty: '10.000', countedQty: '12.000' },
      context,
    );
    const completed = await stock.completeStockTake(
      take.id,
      { idempotencyKey: 'take-complete-1', completedAt: NOW.toISOString() },
      context,
    );
    expect(completed.status).toBe('COMPLETED');
    expect(completed.lines[0].applied).toBe(true);

    const balance = prisma.__stores.stockBalance.find(
      (row: any) => row.itemId === IDS.item && row.locationId === IDS.location,
    );
    expect(balance.qtyOnHand).toBe('12.000');
    const movement = prisma.__stores.stockMovement[0];
    expect(movement.qty).toBe('2.000');
    expect(movement.referenceType).toBe('STOCK_TAKE');
    expect(movement.referenceId).toBe(take.id);
    expect(movement.reference).toBe(`Stock take ${take.id}`);

    const repeated = await stock.completeStockTake(
      take.id,
      { idempotencyKey: 'take-complete-1' },
      context,
    );
    expect(repeated.id).toBe(take.id);
    expect(prisma.__stores.stockMovement).toHaveLength(1);
  });

  it('filters stock balances by item and location', async () => {
    const { stock } = buildServices();
    const byItem = await stock.listBalances(IDS.item);
    expect(byItem).toHaveLength(1);
    expect(byItem[0].qtyOnHand).toBe('10.000');
    expect(byItem[0].avgCost).toBe('10.00');

    const byLocation = await stock.listBalances(undefined, IDS.location);
    expect(byLocation).toHaveLength(2);
    await expect(stock.listBalances('bad-id')).rejects.toThrow(/UUID/);
  });

  it('filters stock movements by date', async () => {
    const { stock, prisma } = buildServices();
    for (const occurredAt of [
      new Date('2026-11-23T10:00:00.000Z'),
      new Date('2026-11-25T10:00:00.000Z'),
    ]) {
      await prisma.stockMovement.create({
        data: {
          itemId: IDS.item,
          locationId: IDS.location,
          batchId: null,
          movementType: 'ADJUSTMENT',
          qty: '1.000',
          unitCost: '10.00',
          referenceType: 'ADJUSTMENT',
          referenceId: IDS.item,
          reference: 'Seed movement',
          occurredAt,
          createdBy: IDS.actor,
        },
      });
    }

    const filtered = await stock.listMovements(undefined, undefined, '2026-11-24', '2026-11-30');
    expect(filtered).toHaveLength(1);
    expect(filtered[0].occurredAt).toBe('2026-11-25T10:00:00.000Z');

    const byItem = await stock.listMovements(IDS.item, IDS.location);
    expect(byItem).toHaveLength(2);
  });

  it('reports low-stock alerts for active items below reorder level', async () => {
    const { stock, prisma } = buildServices();
    const alerts = await stock.lowStockAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0].itemId).toBe(IDS.slowItem);
    expect(alerts[0].qtyOnHand).toBe('1.000');
    expect(alerts[0].reorderLevel).toBe('100.000');

    await prisma.item.update({ where: { id: IDS.slowItem }, data: { active: false } });
    expect(await stock.lowStockAlerts()).toHaveLength(0);
  });

  it('reports valuation with two-decimal totals', async () => {
    const { stock } = buildServices();
    const rows = await stock.valuation(NOW.toISOString());
    expect(rows).toHaveLength(2);
    const valued: any = rows.find((row: any) => row.itemId === IDS.item)!;
    expect(valued.qtyOnHand).toBe('10.000');
    expect(valued.avgCost).toBe('10.00');
    expect(valued.totalValue).toBe('100.00');
    await expect(stock.valuation('yesterday')).rejects.toThrow(/ISO timestamp/);
  });

  it('validates decimals, UUIDs, and dates', async () => {
    const { stock, catalog } = buildServices();
    await expect(
      stock.createReceipt(
        {
          vendorId: IDS.vendor,
          receiptDate: '2026-11-24',
          lines: [{ itemId: IDS.item, qty: '1.2345', unitCost: '10.00' }],
        },
        context,
      ),
    ).rejects.toThrow(/at most 3 places/);
    await expect(
      stock.createReceipt(
        {
          vendorId: IDS.vendor,
          receiptDate: '2026-11-24',
          lines: [{ itemId: IDS.item, qty: '0.000', unitCost: '10.00' }],
        },
        context,
      ),
    ).rejects.toThrow(/greater than zero/);
    await expect(
      stock.createReceipt(
        {
          vendorId: IDS.vendor,
          receiptDate: '2026-11-24',
          lines: [{ itemId: IDS.item, qty: '1.000', unitCost: '-10.00' }],
        },
        context,
      ),
    ).rejects.toThrow(/at most 2 places/);
    await expect(
      stock.createReceipt(
        {
          vendorId: IDS.vendor,
          receiptDate: '24-11-2026',
          lines: [{ itemId: IDS.item, qty: '1.000', unitCost: '10.00' }],
        },
        context,
      ),
    ).rejects.toThrow(/YYYY-MM-DD/);
    await expect(
      stock.createAdjustment(
        { locationId: IDS.location, itemId: IDS.item, qtyDelta: '1.2345', reason: 'Fix' },
        context,
      ),
    ).rejects.toThrow(/signed decimal string/);
    await expect(
      catalog.createItem(
        {
          sku: 'BAD-1',
          name: 'Bad',
          categoryId: 'not-a-uuid',
          unitId: IDS.unitKg,
          reorderLevel: '1.000',
          reorderQty: '1.000',
        },
        context,
      ),
    ).rejects.toThrow(/UUID/);
  });

  it('ingests events once and deduplicates repeats', async () => {
    const { events, prisma } = buildServices();
    const event = createEvent({
      type: 'inventory.purchase.received',
      version: 1,
      actor: { type: 'SERVICE', id: 'accounts-service' },
      payload: { receiptId: IDS.item, vendorId: IDS.vendor },
    });
    expect(await events.ingest(event)).toEqual({
      status: 'ignored',
      eventId: event.id,
      type: 'inventory.purchase.received',
    });
    expect(await events.ingest(event)).toEqual({
      status: 'duplicate',
      eventId: event.id,
      type: 'inventory.purchase.received',
    });
    expect(prisma.__stores.processedEvent).toHaveLength(1);
    await expect(events.ingest({ ...event, id: IDS.event, version: 2 })).rejects.toThrow(
      /version 1/,
    );
  });

  it('allows event ingest with a service token or the stock movement permission', async () => {
    const { eventsController } = buildServices();
    const event = createEvent({
      type: 'inventory.issue.posted',
      version: 1,
      actor: { type: 'SERVICE', id: 'collection-service' },
      payload: {},
    });
    process.env.INVENTORY_INGEST_TOKEN = 'ingest-secret';
    try {
      const withToken = await eventsController.ingest(
        request([], { 'x-service-token': 'ingest-secret' }),
        event,
      );
      expect((await withToken.data).status).toBe('ignored');

      const second = createEvent({
        type: 'inventory.issue.posted',
        version: 1,
        actor: { type: 'SERVICE', id: 'collection-service' },
        payload: {},
      });
      const withPermission = await eventsController.ingest(request(['stock:movement']), second);
      expect((await withPermission.data).status).toBe('ignored');
      await expect(eventsController.ingest(request(), event)).rejects.toThrow(
        /Missing required permission/,
      );
    } finally {
      delete process.env.INVENTORY_INGEST_TOKEN;
    }
  });

  it('writes audit logs for catalog and stock mutations', async () => {
    const { catalog, stock, prisma } = buildServices();
    await catalog.createCategory({ name: 'Audited category' }, context);
    await draftReceipt(stock, 'audit-receipt');
    const actions = prisma.__stores.auditLog.map((row: any) => row.action);
    expect(actions).toContain('category.created');
    expect(actions).toContain('receipt.created');
    expect(prisma.__stores.auditLog.every((row: any) => row.actorId === IDS.actor)).toBe(true);
  });

  it('includes the stock movement immutability trigger in the migration', () => {
    const sql = readFileSync(
      resolve(__dirname, '../prisma/migrations/20261124000000_inventory_init/migration.sql'),
      'utf8',
    );
    expect(sql).toContain('CREATE SCHEMA IF NOT EXISTS "inventory"');
    expect(sql).toContain('BEFORE UPDATE ON "inventory"."stock_movements"');
    expect(sql).toContain('BEFORE DELETE ON "inventory"."stock_movements"');
    expect(sql.toLowerCase()).toContain("'kg'");
    expect(sql.toLowerCase()).toContain("'litre'");
    expect(sql.toLowerCase()).toContain("'pcs'");
    expect(sql.toLowerCase()).toContain("'bag'");
  });
});
