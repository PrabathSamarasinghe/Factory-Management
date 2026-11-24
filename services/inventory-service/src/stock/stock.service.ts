import { Injectable } from '@nestjs/common';
import { Actor, BusinessRuleError, ConflictError, NotFoundError } from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import type { RequestContext } from '../common/request';
import {
  dateOnly,
  dateText,
  dateTimeText,
  dateTimeOrDate,
  decimalText,
  money,
  optionalDateTime,
  optionalString,
  optionalUuid,
  positiveQuantity,
  quantity,
  requiredArray,
  requiredString,
  roundMoney,
  signedQuantity,
  uuid,
} from '../common/validation';
import {
  serializeAdjustment,
  serializeAlert,
  serializeBalance,
  serializeIssue,
  serializeMovement,
  serializeReceipt,
  serializeStockTake,
  serializeStockTakeLine,
  serializeTransfer,
  serializeValuation,
} from '../common/serializers';

const SYSTEM_ACTOR_ID = '00000000-0000-4000-8000-000000000000';

@Injectable()
export class StockService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async createReceipt(input: any, context: RequestContext) {
    const key = optionalString(input?.idempotencyKey, 'idempotencyKey');
    const existing = await this.findByKey('goodsReceipt', key);
    if (existing) return serializeReceipt(existing, await this.receiptLines(existing.id));

    const lines = requiredArray(input?.lines, 'lines').map((value: any) => ({
      itemId: uuid(value?.itemId, 'lines.itemId'),
      qty: positiveQuantity(value?.qty, 'lines.qty'),
      unitCost: money(value?.unitCost, 'lines.unitCost'),
      batchNo: optionalString(value?.batchNo, 'lines.batchNo'),
      expiryDate: value?.expiryDate ? dateOnly(value.expiryDate, 'lines.expiryDate') : null,
    }));
    const locationId = await this.resolveLocation(input?.locationId);

    const row = await this.prisma.goodsReceipt.create({
      data: {
        vendorId: uuid(input?.vendorId, 'vendorId'),
        receiptDate: dateOnly(input?.receiptDate, 'receiptDate'),
        reference: requiredString(input?.reference ?? 'Goods receipt', 'reference'),
        status: 'DRAFT' as any,
        locationId: locationId.id,
        receivedById: context.actorId ?? null,
        idempotencyKey: key ?? null,
        updatedAt: new Date(),
      } as any,
    });
    for (const line of lines) {
      await this.prisma.goodsReceiptLine.create({
        data: { ...line, receiptId: row.id } as any,
      });
    }
    await this.audit.record({
      actorId: context.actorId,
      action: 'receipt.created',
      entityType: 'GoodsReceipt',
      entityId: row.id,
      details: { vendorId: row.vendorId, locationId: row.locationId },
    });
    return serializeReceipt(row, await this.receiptLines(row.id));
  }

  async listReceipts() {
    const rows = await this.prisma.goodsReceipt.findMany({ orderBy: { receiptDate: 'desc' } });
    return Promise.all(
      rows.map(async (row: any) => serializeReceipt(row, await this.receiptLines(row.id))),
    );
  }

  async approveReceipt(id: string, input: any, context: RequestContext) {
    const key = optionalString(input?.idempotencyKey, 'idempotencyKey');
    const existingByKey = await this.findByKey('goodsReceipt', key);
    if (existingByKey)
      return serializeReceipt(existingByKey, await this.receiptLines(existingByKey.id));

    const receiptId = uuid(id, 'id');
    const receipt = await this.requireRow('goodsReceipt', receiptId, 'Goods receipt not found.');
    if (receipt.status === 'APPROVED')
      return serializeReceipt(receipt, await this.receiptLines(receipt.id));
    if (receipt.status !== 'DRAFT') throw new ConflictError('Goods receipt is not a draft.');

    const lines = await this.receiptLines(receiptId);
    if (lines.length === 0) throw new BusinessRuleError('Goods receipt has no lines.');
    await this.resolveLocation(receipt.locationId);
    for (const line of lines) await this.requireActiveItem(line.itemId);

    const approvedAt = optionalDateTime(input?.approvedAt, 'approvedAt') ?? new Date();
    const eventLines: Array<Record<string, string>> = [];
    let totalValue = 0;

    const updated = await this.prisma.$transaction(async (tx: any) => {
      for (const line of lines) {
        const qty = decimalText(line.qty, 3);
        const unitCost = decimalText(line.unitCost, 2);
        const value = decimalText(Number(qty) * Number(unitCost), 2);
        totalValue = roundMoney(totalValue + Number(value));

        if (line.batchNo) {
          const batch = await tx.stockBatch.findUnique({
            where: { itemId_batchNo: { itemId: line.itemId, batchNo: line.batchNo } },
          });
          if (batch) {
            await tx.stockBatch.update({
              where: { id: batch.id },
              data: {
                qtyRemaining: decimalText(Number(batch.qtyRemaining) + Number(qty), 3),
              } as any,
            });
          } else {
            await tx.stockBatch.create({
              data: {
                itemId: line.itemId,
                batchNo: line.batchNo,
                receivedOn: approvedAt,
                expiryDate: line.expiryDate ? new Date(line.expiryDate) : null,
                qtyRemaining: qty,
              } as any,
            });
          }
        }

        await this.writeMovement(tx, {
          itemId: line.itemId,
          locationId: receipt.locationId,
          batchId: null,
          movementType: 'RECEIPT',
          qty,
          unitCost,
          referenceType: 'RECEIPT',
          referenceId: receiptId,
          reference: `Goods receipt ${receiptId}`,
          occurredAt: approvedAt,
          createdBy: context.actorId ?? null,
        });
        await this.applyWeightedAverage(
          tx,
          line.itemId,
          receipt.locationId,
          qty,
          unitCost,
          approvedAt,
        );
        eventLines.push({
          itemId: line.itemId,
          qty,
          unitCost,
          value,
          inventoryAccountCode: '1210',
          payableAccountCode: '2050',
        });
      }

      return tx.goodsReceipt.update({
        where: { id: receiptId },
        data: {
          status: 'APPROVED' as any,
          approvedById: context.actorId ?? null,
          approvedAt,
          updatedAt: approvedAt,
        } as any,
      });
    });

    await this.outbox.append(
      'inventory.purchase.received',
      {
        receiptId,
        vendorId: receipt.vendorId,
        receivedDate: dateText(receipt.receiptDate),
        reference: receipt.reference,
        lines: eventLines,
        totalValue: decimalText(totalValue, 2),
        approvedBy: this.actorId(context),
        approvedAt: dateTimeText(approvedAt),
      },
      this.eventActor(context),
    );
    await this.audit.record({
      actorId: context.actorId,
      action: 'receipt.approved',
      entityType: 'GoodsReceipt',
      entityId: receiptId,
      details: { totalValue: decimalText(totalValue, 2) },
    });
    return serializeReceipt(updated, lines);
  }

  async createIssue(input: any, context: RequestContext) {
    const key = optionalString(input?.idempotencyKey, 'idempotencyKey');
    const existing = await this.findByKey('goodsIssue', key);
    if (existing) return serializeIssue(existing, await this.issueLines(existing.id));

    const lines = requiredArray(input?.lines, 'lines').map((value: any) => ({
      itemId: uuid(value?.itemId, 'lines.itemId'),
      qty: positiveQuantity(value?.qty, 'lines.qty'),
      batchId: optionalUuid(value?.batchId, 'lines.batchId') ?? null,
    }));
    const row = await this.prisma.goodsIssue.create({
      data: {
        issueDate: dateOnly(input?.issueDate, 'issueDate'),
        issuedToType: requiredString(input?.issuedToType, 'issuedToType'),
        issuedToId: uuid(input?.issuedToId, 'issuedToId'),
        purpose: requiredString(input?.purpose, 'purpose'),
        status: 'DRAFT' as any,
        issuedById: context.actorId ?? null,
        idempotencyKey: key ?? null,
        updatedAt: new Date(),
      } as any,
    });
    for (const line of lines) {
      await this.prisma.goodsIssueLine.create({ data: { ...line, issueId: row.id } as any });
    }
    await this.audit.record({
      actorId: context.actorId,
      action: 'issue.created',
      entityType: 'GoodsIssue',
      entityId: row.id,
      details: { issuedToType: row.issuedToType, issuedToId: row.issuedToId },
    });
    return serializeIssue(row, await this.issueLines(row.id));
  }

  async listIssues() {
    const rows = await this.prisma.goodsIssue.findMany({ orderBy: { issueDate: 'desc' } });
    return Promise.all(
      rows.map(async (row: any) => serializeIssue(row, await this.issueLines(row.id))),
    );
  }

  async approveIssue(id: string, input: any, context: RequestContext) {
    const key = optionalString(input?.idempotencyKey, 'idempotencyKey');
    const existingByKey = await this.findByKey('goodsIssue', key);
    if (existingByKey)
      return serializeIssue(existingByKey, await this.issueLines(existingByKey.id));

    const issueId = uuid(id, 'id');
    const issue = await this.requireRow('goodsIssue', issueId, 'Goods issue not found.');
    if (issue.status === 'APPROVED') return serializeIssue(issue, await this.issueLines(issue.id));
    if (issue.status !== 'DRAFT') throw new ConflictError('Goods issue is not a draft.');

    const location = await this.resolveLocation(input?.locationId);
    const lines = await this.issueLines(issueId);
    if (lines.length === 0) throw new BusinessRuleError('Goods issue has no lines.');

    const balances: any[] = [];
    for (const line of lines) {
      await this.requireActiveItem(line.itemId);
      const balance = await this.balanceFor(line.itemId, location.id);
      if (Number(balance?.qtyOnHand ?? 0) < Number(line.qty)) {
        throw new BusinessRuleError(`Insufficient stock for item ${line.itemId}.`);
      }
      balances.push(balance);
    }

    const approvedAt = optionalDateTime(input?.approvedAt, 'approvedAt') ?? new Date();
    const eventLines: Array<Record<string, string>> = [];
    let totalValue = 0;

    const updated = await this.prisma.$transaction(async (tx: any) => {
      for (const [index, line] of lines.entries()) {
        const balance = balances[index];
        const qty = decimalText(line.qty, 3);
        const unitCost = decimalText(balance?.avgCost ?? 0, 2);
        const value = decimalText(Number(qty) * Number(unitCost), 2);
        totalValue = roundMoney(totalValue + Number(value));

        await this.writeMovement(tx, {
          itemId: line.itemId,
          locationId: location.id,
          batchId: line.batchId,
          movementType: 'ISSUE',
          qty: decimalText(-Number(qty), 3),
          unitCost,
          referenceType: 'ISSUE',
          referenceId: issueId,
          reference: `Goods issue ${issueId}`,
          occurredAt: approvedAt,
          createdBy: context.actorId ?? null,
        });
        await this.setBalance(
          tx,
          line.itemId,
          location.id,
          Number(balance?.qtyOnHand ?? 0) - Number(qty),
          unitCost,
          approvedAt,
        );
        eventLines.push({
          itemId: line.itemId,
          qty,
          unitCost,
          value,
          expenseAccountCode: '5030',
          inventoryAccountCode: '1210',
        });
      }
      return tx.goodsIssue.update({
        where: { id: issueId },
        data: {
          status: 'APPROVED' as any,
          approvedById: context.actorId ?? null,
          approvedAt,
          updatedAt: approvedAt,
        } as any,
      });
    });

    await this.outbox.append(
      'inventory.issue.posted',
      {
        issueId,
        issueDate: dateText(issue.issueDate),
        issuedToType: issue.issuedToType,
        issuedToId: issue.issuedToId,
        purpose: issue.purpose,
        lines: eventLines,
        totalValue: decimalText(totalValue, 2),
        approvedBy: this.actorId(context),
        approvedAt: dateTimeText(approvedAt),
      },
      this.eventActor(context),
    );
    await this.audit.record({
      actorId: context.actorId,
      action: 'issue.approved',
      entityType: 'GoodsIssue',
      entityId: issueId,
      details: { totalValue: decimalText(totalValue, 2) },
    });
    return serializeIssue(updated, lines);
  }

  async createTransfer(input: any, context: RequestContext) {
    const key = optionalString(input?.idempotencyKey, 'idempotencyKey');
    const existing = await this.findByKey('transfer', key);
    if (existing) return serializeTransfer(existing, await this.transferLines(existing.id));

    const fromLocationId = uuid(input?.fromLocationId, 'fromLocationId');
    const toLocationId = uuid(input?.toLocationId, 'toLocationId');
    if (fromLocationId === toLocationId) {
      throw new BusinessRuleError('Source and destination locations must differ.');
    }
    const lines = requiredArray(input?.lines, 'lines').map((value: any) => ({
      itemId: uuid(value?.itemId, 'lines.itemId'),
      qty: positiveQuantity(value?.qty, 'lines.qty'),
      batchId: optionalUuid(value?.batchId, 'lines.batchId') ?? null,
    }));
    const row = await this.prisma.transfer.create({
      data: {
        fromLocationId,
        toLocationId,
        status: 'DRAFT' as any,
        idempotencyKey: key ?? null,
        updatedAt: new Date(),
      } as any,
    });
    for (const line of lines) {
      await this.prisma.transferLine.create({ data: { ...line, transferId: row.id } as any });
    }
    await this.audit.record({
      actorId: context.actorId,
      action: 'transfer.created',
      entityType: 'Transfer',
      entityId: row.id,
      details: { fromLocationId, toLocationId },
    });
    return serializeTransfer(row, await this.transferLines(row.id));
  }

  async listTransfers() {
    const rows = await this.prisma.transfer.findMany({ orderBy: { createdAt: 'desc' } });
    return Promise.all(
      rows.map(async (row: any) => serializeTransfer(row, await this.transferLines(row.id))),
    );
  }

  async approveTransfer(id: string, input: any, context: RequestContext) {
    const key = optionalString(input?.idempotencyKey, 'idempotencyKey');
    const existingByKey = await this.findByKey('transfer', key);
    if (existingByKey)
      return serializeTransfer(existingByKey, await this.transferLines(existingByKey.id));

    const transferId = uuid(id, 'id');
    const transfer = await this.requireRow('transfer', transferId, 'Transfer not found.');
    if (transfer.status === 'APPROVED')
      return serializeTransfer(transfer, await this.transferLines(transfer.id));
    if (transfer.status !== 'DRAFT') throw new ConflictError('Transfer is not a draft.');
    if (transfer.fromLocationId === transfer.toLocationId) {
      throw new BusinessRuleError('Source and destination locations must differ.');
    }
    await this.resolveLocation(transfer.fromLocationId);
    await this.resolveLocation(transfer.toLocationId);

    const lines = await this.transferLines(transferId);
    if (lines.length === 0) throw new BusinessRuleError('Transfer has no lines.');
    const balances: any[] = [];
    for (const line of lines) {
      await this.requireActiveItem(line.itemId);
      const balance = await this.balanceFor(line.itemId, transfer.fromLocationId);
      if (Number(balance?.qtyOnHand ?? 0) < Number(line.qty)) {
        throw new BusinessRuleError(`Insufficient stock for item ${line.itemId}.`);
      }
      balances.push(balance);
    }

    const approvedAt = optionalDateTime(input?.approvedAt, 'approvedAt') ?? new Date();
    const updated = await this.prisma.$transaction(async (tx: any) => {
      for (const [index, line] of lines.entries()) {
        const balance = balances[index];
        const qty = decimalText(line.qty, 3);
        const unitCost = decimalText(balance?.avgCost ?? 0, 2);

        await this.writeMovement(tx, {
          itemId: line.itemId,
          locationId: transfer.fromLocationId,
          batchId: line.batchId,
          movementType: 'TRANSFER_OUT',
          qty: decimalText(-Number(qty), 3),
          unitCost,
          referenceType: 'TRANSFER',
          referenceId: transferId,
          reference: `Transfer ${transferId}`,
          occurredAt: approvedAt,
          createdBy: context.actorId ?? null,
        });
        await this.writeMovement(tx, {
          itemId: line.itemId,
          locationId: transfer.toLocationId,
          batchId: line.batchId,
          movementType: 'TRANSFER_IN',
          qty,
          unitCost,
          referenceType: 'TRANSFER',
          referenceId: transferId,
          reference: `Transfer ${transferId}`,
          occurredAt: approvedAt,
          createdBy: context.actorId ?? null,
        });
        await this.setBalance(
          tx,
          line.itemId,
          transfer.fromLocationId,
          Number(balance?.qtyOnHand ?? 0) - Number(qty),
          unitCost,
          approvedAt,
        );
        await this.applyWeightedAverage(
          tx,
          line.itemId,
          transfer.toLocationId,
          qty,
          unitCost,
          approvedAt,
        );
      }
      return tx.transfer.update({
        where: { id: transferId },
        data: {
          status: 'APPROVED' as any,
          approvedById: context.actorId ?? null,
          approvedAt,
          updatedAt: approvedAt,
        } as any,
      });
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'transfer.approved',
      entityType: 'Transfer',
      entityId: transferId,
    });
    return serializeTransfer(updated, lines);
  }

  async createAdjustment(input: any, context: RequestContext) {
    const key = optionalString(input?.idempotencyKey, 'idempotencyKey');
    const existing = await this.findByKey('adjustment', key);
    if (existing) return serializeAdjustment(existing);

    const locationId = uuid(input?.locationId, 'locationId');
    const itemId = uuid(input?.itemId, 'itemId');
    const row = await this.prisma.adjustment.create({
      data: {
        locationId,
        itemId,
        qtyDelta: signedQuantity(input?.qtyDelta, 'qtyDelta'),
        reason: requiredString(input?.reason, 'reason'),
        status: 'DRAFT' as any,
        idempotencyKey: key ?? null,
        updatedAt: new Date(),
      } as any,
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'adjustment.created',
      entityType: 'Adjustment',
      entityId: row.id,
      details: { itemId, locationId, qtyDelta: decimalText(row.qtyDelta, 3) },
    });
    return serializeAdjustment(row);
  }

  async listAdjustments() {
    const rows = await this.prisma.adjustment.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map(serializeAdjustment);
  }

  async approveAdjustment(id: string, input: any, context: RequestContext) {
    const key = optionalString(input?.idempotencyKey, 'idempotencyKey');
    const existingByKey = await this.findByKey('adjustment', key);
    if (existingByKey) return serializeAdjustment(existingByKey);

    const adjustmentId = uuid(id, 'id');
    const adjustment = await this.requireRow('adjustment', adjustmentId, 'Adjustment not found.');
    if (adjustment.status === 'APPROVED') return serializeAdjustment(adjustment);
    if (adjustment.status !== 'DRAFT') throw new ConflictError('Adjustment is not a draft.');
    await this.resolveLocation(adjustment.locationId);
    await this.requireActiveItem(adjustment.itemId);

    const delta = Number(adjustment.qtyDelta);
    if (delta === 0) throw new BusinessRuleError('Adjustment quantity delta must not be zero.');
    const balance = await this.balanceFor(adjustment.itemId, adjustment.locationId);
    if (delta < 0 && Number(balance?.qtyOnHand ?? 0) < Math.abs(delta)) {
      throw new BusinessRuleError('Insufficient stock for adjustment.');
    }
    const approvedAt = optionalDateTime(input?.approvedAt, 'approvedAt') ?? new Date();
    const providedCost = optionalString(input?.unitCost, 'unitCost');
    const unitCost =
      delta < 0 || !providedCost
        ? decimalText(balance?.avgCost ?? 0, 2)
        : money(providedCost, 'unitCost');

    const updated = await this.prisma.$transaction(async (tx: any) => {
      await this.writeMovement(tx, {
        itemId: adjustment.itemId,
        locationId: adjustment.locationId,
        batchId: null,
        movementType: 'ADJUSTMENT',
        qty: decimalText(delta, 3),
        unitCost,
        referenceType: 'ADJUSTMENT',
        referenceId: adjustmentId,
        reference: `Adjustment ${adjustmentId}`,
        occurredAt: approvedAt,
        createdBy: context.actorId ?? null,
      });
      if (delta > 0 && providedCost) {
        await this.applyWeightedAverage(
          tx,
          adjustment.itemId,
          adjustment.locationId,
          decimalText(delta, 3),
          unitCost,
          approvedAt,
        );
      } else {
        await this.setBalance(
          tx,
          adjustment.itemId,
          adjustment.locationId,
          Number(balance?.qtyOnHand ?? 0) + delta,
          unitCost,
          approvedAt,
        );
      }
      return tx.adjustment.update({
        where: { id: adjustmentId },
        data: {
          status: 'APPROVED' as any,
          approvedById: context.actorId ?? null,
          approvedAt,
          updatedAt: approvedAt,
        } as any,
      });
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'adjustment.approved',
      entityType: 'Adjustment',
      entityId: adjustmentId,
      details: { qtyDelta: decimalText(delta, 3), unitCost },
    });
    return serializeAdjustment(updated);
  }

  async createStockTake(input: any, context: RequestContext) {
    const key = optionalString(input?.idempotencyKey, 'idempotencyKey');
    const existing = await this.findByKey('stockTake', key);
    if (existing) return serializeStockTake(existing, await this.stockTakeLines(existing.id));

    const locationId = uuid(input?.locationId, 'locationId');
    await this.resolveLocation(locationId);
    const row = await this.prisma.stockTake.create({
      data: {
        locationId,
        status: 'OPEN' as any,
        startedAt: optionalDateTime(input?.startedAt, 'startedAt') ?? new Date(),
        idempotencyKey: key ?? null,
      } as any,
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'stockTake.created',
      entityType: 'StockTake',
      entityId: row.id,
      details: { locationId },
    });
    return serializeStockTake(row, []);
  }

  async listStockTakes() {
    const rows = await this.prisma.stockTake.findMany({ orderBy: { startedAt: 'desc' } });
    return Promise.all(
      rows.map(async (row: any) => serializeStockTake(row, await this.stockTakeLines(row.id))),
    );
  }

  async addStockTakeLine(takeId: string, input: any, context: RequestContext) {
    const id = uuid(takeId, 'takeId');
    const take = await this.requireRow('stockTake', id, 'Stock take not found.');
    if (take.status !== 'OPEN') throw new ConflictError('Stock take is not open.');
    const itemId = uuid(input?.itemId, 'itemId');
    await this.requireActiveItem(itemId);
    const duplicate = await this.prisma.stockTakeLine.findUnique({
      where: { takeId_itemId: { takeId: id, itemId } },
    });
    if (duplicate) throw new ConflictError('This item already has a stock take line.');

    const systemQty = quantity(input?.systemQty, 'systemQty');
    const countedQty = quantity(input?.countedQty, 'countedQty');
    const variance =
      input?.variance === undefined
        ? decimalText(Number(countedQty) - Number(systemQty), 3)
        : signedQuantity(input.variance, 'variance');
    const row = await this.prisma.stockTakeLine.create({
      data: { takeId: id, itemId, systemQty, countedQty, variance } as any,
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'stockTakeLine.added',
      entityType: 'StockTakeLine',
      entityId: row.id,
      details: { takeId: id, itemId, variance },
    });
    return serializeStockTakeLine(row);
  }

  async completeStockTake(id: string, input: any, context: RequestContext) {
    const key = optionalString(input?.idempotencyKey, 'idempotencyKey');
    const existingByKey = await this.findByKey('stockTake', key);
    if (existingByKey)
      return serializeStockTake(existingByKey, await this.stockTakeLines(existingByKey.id));

    const takeId = uuid(id, 'id');
    const take = await this.requireRow('stockTake', takeId, 'Stock take not found.');
    if (take.status === 'COMPLETED')
      return serializeStockTake(take, await this.stockTakeLines(take.id));
    if (take.status !== 'OPEN') throw new ConflictError('Stock take is not open.');

    const lines = await this.stockTakeLines(takeId);
    const completedAt = optionalDateTime(input?.completedAt, 'completedAt') ?? new Date();
    const updated = await this.prisma.$transaction(async (tx: any) => {
      for (const line of lines) {
        const variance = Number(line.variance);
        if (variance === 0) continue;
        const balance = await this.balanceFor(line.itemId, take.locationId);
        if (Number(balance?.qtyOnHand ?? 0) + variance < 0) {
          throw new BusinessRuleError(
            `Stock take variance would make stock negative for ${line.itemId}.`,
          );
        }
        const unitCost = decimalText(balance?.avgCost ?? 0, 2);
        await this.writeMovement(tx, {
          itemId: line.itemId,
          locationId: take.locationId,
          batchId: null,
          movementType: 'ADJUSTMENT',
          qty: decimalText(variance, 3),
          unitCost,
          referenceType: 'STOCK_TAKE',
          referenceId: takeId,
          reference: `Stock take ${takeId}`,
          occurredAt: completedAt,
          createdBy: context.actorId ?? null,
        });
        await this.setBalance(
          tx,
          line.itemId,
          take.locationId,
          Number(balance?.qtyOnHand ?? 0) + variance,
          unitCost,
          completedAt,
        );
        await tx.stockTakeLine.update({
          where: { id: line.id },
          data: { applied: true } as any,
        });
      }
      return tx.stockTake.update({
        where: { id: takeId },
        data: { status: 'COMPLETED' as any, completedAt, updatedAt: completedAt } as any,
      });
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'stockTake.completed',
      entityType: 'StockTake',
      entityId: takeId,
    });
    return serializeStockTake(updated, await this.stockTakeLines(takeId));
  }

  async listBalances(itemId?: string, locationId?: string) {
    const where: any = {};
    if (itemId) where.itemId = uuid(itemId, 'itemId');
    if (locationId) where.locationId = uuid(locationId, 'locationId');
    const rows = await this.prisma.stockBalance.findMany({ where });
    return rows.map(serializeBalance);
  }

  async listMovements(itemId?: string, locationId?: string, from?: string, to?: string) {
    const where: any = {};
    if (itemId) where.itemId = uuid(itemId, 'itemId');
    if (locationId) where.locationId = uuid(locationId, 'locationId');
    if (from) where.occurredAt = { ...(where.occurredAt ?? {}), gte: dateTimeOrDate(from, 'from') };
    if (to) where.occurredAt = { ...(where.occurredAt ?? {}), lte: dateTimeOrDate(to, 'to') };
    const rows = await this.prisma.stockMovement.findMany({
      orderBy: { occurredAt: 'desc' },
      where,
    });
    return rows.map(serializeMovement);
  }

  async lowStockAlerts() {
    const [items, balances] = await Promise.all([
      this.prisma.item.findMany({ where: { active: true } }),
      this.prisma.stockBalance.findMany(),
    ]);
    const alerts: any[] = [];
    for (const balance of balances as any[]) {
      const item = (items as any[]).find((candidate) => candidate.id === balance.itemId);
      if (!item) continue;
      if (Number(balance.qtyOnHand) < Number(item.reorderLevel)) {
        alerts.push({ item, balance });
      }
    }
    return alerts.map(({ item, balance }) => serializeAlert(item, balance));
  }

  async valuation(asOf?: string) {
    if (asOf) dateTimeOrDate(asOf, 'asOf');
    const rows = await this.prisma.stockBalance.findMany();
    return (rows as any[]).map(serializeValuation);
  }

  private async writeMovement(tx: any, input: Record<string, unknown>) {
    return tx.stockMovement.create({ data: { ...input } as any });
  }

  private balanceFor(itemId: string, locationId: string) {
    return this.prisma.stockBalance.findUnique({
      where: { itemId_locationId: { itemId, locationId } },
    });
  }

  private async setBalance(
    tx: any,
    itemId: string,
    locationId: string,
    qty: number,
    avgCost: string,
    updatedAt: Date,
  ) {
    const data = {
      qtyOnHand: decimalText(qty, 3),
      avgCost: decimalText(avgCost, 2),
      updatedAt,
    };
    return tx.stockBalance.upsert({
      where: { itemId_locationId: { itemId, locationId } },
      create: { itemId, locationId, ...data } as any,
      update: data as any,
    });
  }

  private async applyWeightedAverage(
    tx: any,
    itemId: string,
    locationId: string,
    qtyText: string,
    unitCostText: string,
    updatedAt: Date,
  ) {
    const existing = await tx.stockBalance.findUnique({
      where: { itemId_locationId: { itemId, locationId } },
    });
    const oldQty = Number(existing?.qtyOnHand ?? 0);
    const oldAvg = Number(existing?.avgCost ?? 0);
    const qty = Number(qtyText);
    const newQty = oldQty + qty;
    const avgCost =
      newQty > 0 ? roundMoney((oldQty * oldAvg + qty * Number(unitCostText)) / newQty) : oldAvg;
    return this.setBalance(tx, itemId, locationId, newQty, decimalText(avgCost, 2), updatedAt);
  }

  private async resolveLocation(locationId?: unknown) {
    const id = locationId ? uuid(locationId, 'locationId') : await this.firstActiveLocationId();
    const location = await this.prisma.stockLocation.findUnique({ where: { id } });
    if (!location || !location.active) throw new BusinessRuleError('Stock location is not active.');
    return location;
  }

  private async firstActiveLocationId() {
    const locations = await this.prisma.stockLocation.findMany({ where: { active: true } });
    if (locations.length === 0)
      throw new BusinessRuleError('No active stock location is configured.');
    return locations[0].id;
  }

  private async requireActiveItem(itemId: string) {
    const item = await this.requireRow('item', itemId, 'Item not found.');
    if (!item.active) throw new BusinessRuleError(`Item ${itemId} is inactive.`);
    return item;
  }

  private findByKey(model: string, key?: string) {
    if (!key) return Promise.resolve(null);
    return (this.prisma as any)[model].findUnique({ where: { idempotencyKey: key } });
  }

  private requireRow(model: string, id: string, message: string) {
    return (this.prisma as any)[model].findUnique({ where: { id } }).then((row: any) => {
      if (!row) throw new NotFoundError(message);
      return row;
    });
  }

  private receiptLines(receiptId: string) {
    return this.prisma.goodsReceiptLine.findMany({ where: { receiptId } });
  }

  private issueLines(issueId: string) {
    return this.prisma.goodsIssueLine.findMany({ where: { issueId } });
  }

  private transferLines(transferId: string) {
    return this.prisma.transferLine.findMany({ where: { transferId } });
  }

  private stockTakeLines(takeId: string) {
    return this.prisma.stockTakeLine.findMany({ where: { takeId } });
  }

  private eventActor(context: RequestContext): Actor {
    return context.actorId ? { type: 'USER', id: context.actorId } : { type: 'SYSTEM', id: null };
  }

  private actorId(context: RequestContext): string {
    return context.actorId ?? SYSTEM_ACTOR_ID;
  }
}
