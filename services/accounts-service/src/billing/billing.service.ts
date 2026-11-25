import { Injectable } from '@nestjs/common';
import { BusinessRuleError, ConflictError, NotFoundError } from '@galatura/platform-kit';
import type { EventEnvelope } from '@galatura/platform-kit';
import { AccountsService } from '../accounts/accounts.service';
import { AuditService } from '../audit/audit.service';
import { JournalService } from '../journal/journal.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestContext } from '../common/request';
import {
  dateKey,
  dateOnly,
  money,
  moneyText,
  optionalString,
  quantity,
  requiredString,
  roundMoney,
  uuid,
} from '../common/validation';
import { quantityText, serializeBill } from '../common/serialize';

const ADJUSTMENT_TYPES = ['ADVANCE', 'FERTILIZER_LOAN', 'DEDUCTION', 'BONUS'] as const;

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly accounts: AccountsService,
    private readonly journal: JournalService,
  ) {}

  async listRates() {
    const rows = await this.prisma.teaRate.findMany({ orderBy: { effectiveFrom: 'desc' } });
    return rows.map((row) => this.serializeRate(row));
  }

  async createRate(input: any, context: RequestContext) {
    const grade = requiredString(input?.grade, 'grade');
    const ratePerKg = money(input?.ratePerKg, 'ratePerKg');
    const effectiveFrom = dateOnly(input?.effectiveFrom, 'effectiveFrom');
    const effectiveTo = input?.effectiveTo ? dateOnly(input.effectiveTo, 'effectiveTo') : null;
    if (effectiveTo && effectiveTo <= effectiveFrom) {
      throw new BusinessRuleError('effectiveTo must be after effectiveFrom.');
    }

    const existing = await this.prisma.teaRate.findUnique({
      where: { grade_effectiveFrom: { grade, effectiveFrom } },
    });
    if (existing) throw new ConflictError('A rate for this grade and date already exists.');

    const row = await this.prisma.teaRate.create({
      data: {
        grade,
        ratePerKg,
        effectiveFrom,
        effectiveTo,
        approver: context.actorId,
      },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'rate.created',
      entityType: 'TeaRate',
      entityId: row.id,
      metadata: { grade, ratePerKg },
    });
    return this.serializeRate(row);
  }

  async updateRate(id: string, input: any, context: RequestContext) {
    const row = await this.prisma.teaRate.findUnique({ where: { id } });
    if (!row) throw new NotFoundError('Rate not found.');

    const updated = await this.prisma.teaRate.update({
      where: { id },
      data: {
        ratePerKg: input?.ratePerKg === undefined ? undefined : money(input.ratePerKg, 'ratePerKg'),
        effectiveTo:
          input?.effectiveTo === undefined
            ? undefined
            : input.effectiveTo === null
              ? null
              : dateOnly(input.effectiveTo, 'effectiveTo'),
        approver: context.actorId,
      },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'rate.updated',
      entityType: 'TeaRate',
      entityId: id,
    });
    return this.serializeRate(updated);
  }

  async listBills() {
    const rows = await this.prisma.supplierBill.findMany({ orderBy: { periodTo: 'desc' } });
    return rows.map((row) => serializeBill(row));
  }

  async ingestCollectedTotal(event: EventEnvelope<any>) {
    const payload = event?.payload ?? {};
    const eventId = uuid(event?.id, 'event.id');
    const supplierId = uuid(payload.supplierId, 'payload.supplierId');
    const collectionDate = dateOnly(payload.collectionDate, 'payload.collectionDate');
    const totalNetKg = quantity(payload.totalNetKg, 'payload.totalNetKg');
    const dailyTotalId = payload.dailyTotalId
      ? uuid(payload.dailyTotalId, 'payload.dailyTotalId')
      : null;
    const grade = optionalString(payload.grade, 'payload.grade');

    const existing = await this.prisma.collectedTotal.findUnique({ where: { eventId } });
    if (existing) return { eventId, duplicate: true, collectedTotalId: existing.id };

    const row = await this.prisma.collectedTotal.create({
      data: {
        eventId,
        supplierId,
        collectionDate,
        totalNetKg,
        grade,
        dailyTotalId,
        processed: false,
      },
    });
    return { eventId, duplicate: false, collectedTotalId: row.id };
  }

  async generateBills(input: any, context: RequestContext) {
    const periodFrom = dateOnly(input?.periodFrom, 'periodFrom');
    const periodTo = dateOnly(input?.periodTo, 'periodTo');
    if (periodTo < periodFrom)
      throw new BusinessRuleError('periodTo must not be before periodFrom.');
    const supplierId = input?.supplierId ? uuid(input.supplierId, 'supplierId') : undefined;
    const idempotencyKey = requiredString(input?.idempotencyKey, 'idempotencyKey');

    const existing = await this.prisma.supplierBill.findUnique({ where: { idempotencyKey } });
    if (existing) return { bills: [serializeBill(existing)], duplicate: true };

    const totals = (
      await this.prisma.collectedTotal.findMany({ where: { processed: false } })
    ).filter((row: any) => {
      const date = new Date(row.collectionDate);
      if (date < periodFrom || date > periodTo) return false;
      if (supplierId && row.supplierId !== supplierId) return false;
      return true;
    });
    if (totals.length === 0)
      throw new BusinessRuleError('No unprocessed collected totals in this period.');

    const grouped = new Map<string, any[]>();
    for (const row of totals) {
      grouped.set(row.supplierId, [...(grouped.get(row.supplierId) ?? []), row]);
    }

    const bills: any[] = [];
    for (const [supplier, rows] of grouped.entries()) {
      const bill = await this.prisma.$transaction(async (tx: any) => {
        const lines: any[] = [];
        let grossAmount = 0;
        for (const row of rows) {
          const rate = await this.rateFor(row.grade ?? 'STANDARD', new Date(row.collectionDate));
          const amount = roundMoney(Number(row.totalNetKg) * Number(rate.ratePerKg));
          grossAmount += amount;
          lines.push({
            collectionDate: new Date(row.collectionDate),
            totalNetKg: row.totalNetKg,
            ratePerKg: rate.ratePerKg,
            amount: moneyText(amount),
            dailyTotalId: row.dailyTotalId,
          });
        }

        const adjustments = await tx.supplierAdjustment.findMany({
          where: { supplierId: supplier, status: 'OPEN' as any },
        });
        const deductions = adjustments
          .filter((adjustment: any) => adjustment.adjustmentType !== 'BONUS')
          .reduce((sum: number, adjustment: any) => sum + Number(adjustment.amount ?? 0), 0);
        const bonuses = adjustments
          .filter((adjustment: any) => adjustment.adjustmentType === 'BONUS')
          .reduce((sum: number, adjustment: any) => sum + Number(adjustment.amount ?? 0), 0);
        const totalGross = roundMoney(grossAmount + bonuses);
        const deductionsAmount = roundMoney(deductions);
        const netPayable = roundMoney(totalGross - deductionsAmount);

        const created = await tx.supplierBill.create({
          data: {
            supplierId: supplier,
            periodFrom,
            periodTo,
            totalKg: quantityText(
              rows.reduce((sum: number, row: any) => sum + Number(row.totalNetKg), 0),
            ),
            grossAmount: moneyText(totalGross),
            deductionsAmount: moneyText(deductionsAmount),
            netPayable: moneyText(netPayable),
            status: 'DRAFT' as any,
            idempotencyKey: `${idempotencyKey}:${supplier}`,
          },
        });

        for (const line of lines) {
          await tx.supplierBillLine.create({
            data: { ...line, billId: created.id },
          });
        }
        for (const row of rows) {
          await tx.collectedTotal.update({ where: { id: row.id }, data: { processed: true } });
        }
        await this.audit.record(
          {
            actorId: context.actorId,
            action: 'supplierBill.generated',
            entityType: 'SupplierBill',
            entityId: created.id,
            metadata: { supplierId: supplier, netPayable: moneyText(netPayable) },
          },
          tx,
        );
        return created;
      });

      const billLines = await this.prisma.supplierBillLine.findMany({ where: { billId: bill.id } });
      bills.push(serializeBill(bill, billLines));
    }

    return { bills, duplicate: false };
  }

  async approveBill(id: string, input: any, context: RequestContext) {
    const bill = await this.prisma.supplierBill.findUnique({ where: { id } });
    if (!bill) throw new NotFoundError('Supplier bill not found.');
    if (bill.status !== 'DRAFT') throw new ConflictError('Supplier bill is not a draft.');

    const lines = await this.prisma.supplierBillLine.findMany({ where: { billId: id } });
    const entryDate = new Date(bill.periodTo);
    const resolved = await this.accounts.resolvePostingAccounts({
      eventType: 'supplier.bill.approved',
      effectiveDate: entryDate,
      condition: { sourceType: 'COLLECTION' },
      fallback: { debitCode: '5000', creditCode: '2000' },
    });
    const purchaseAccountId = resolved.debitAccountId;
    const payableAccountId = resolved.creditAccountId;
    const idempotencyKey = requiredString(
      input?.idempotencyKey ?? `supplier-bill:${id}`,
      'idempotencyKey',
    );

    const entry = await this.journal.postSystem(
      {
        entryDate: dateKey(new Date(bill.periodTo)),
        description: `Supplier bill ${id.slice(0, 8)}`,
        sourceType: 'COLLECTION',
        sourceId: id,
        idempotencyKey,
        lines: [
          {
            accountId: purchaseAccountId,
            debit: moneyText(bill.grossAmount),
            credit: '0.00',
            memo: 'Green leaf purchases',
          },
          {
            accountId: payableAccountId,
            debit: '0.00',
            credit: moneyText(bill.netPayable),
            partyType: 'SUPPLIER',
            partyId: bill.supplierId,
            memo: 'Supplier payable',
          },
        ],
      },
      context,
    );

    const deductions = Number(bill.grossAmount) - Number(bill.netPayable);
    if (roundMoney(deductions) > 0) {
      const deductionAccounts = await this.accounts.resolvePostingAccounts({
        eventType: 'supplier.bill.deductions',
        effectiveDate: entryDate,
        condition: { sourceType: 'COLLECTION' },
        fallback: { debitCode: '2000', creditCode: '5000' },
      });
      await this.journal.postSystem(
        {
          entryDate: dateKey(new Date(bill.periodTo)),
          description: `Supplier bill deductions ${id.slice(0, 8)}`,
          sourceType: 'COLLECTION',
          sourceId: id,
          idempotencyKey: `${idempotencyKey}:deductions`,
          lines: [
            {
              accountId: deductionAccounts.debitAccountId,
              debit: moneyText(deductions),
              credit: '0.00',
              partyType: 'SUPPLIER',
              partyId: bill.supplierId,
              memo: 'Supplier deductions applied',
            },
            {
              accountId: deductionAccounts.creditAccountId,
              debit: '0.00',
              credit: moneyText(deductions),
              memo: 'Supplier deductions applied',
            },
          ],
        },
        context,
      );
    }

    const updated = await this.prisma.supplierBill.update({
      where: { id },
      data: {
        status: 'APPROVED' as any,
        approvedBy: context.actorId,
        approvedAt: new Date(),
        journalEntryId: entry.id,
      },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'supplierBill.approved',
      entityType: 'SupplierBill',
      entityId: id,
    });
    return serializeBill(updated, lines);
  }

  async supplierPayable(supplierId: string, asOf?: Date) {
    const account = await this.accounts.accountByCode('2000');
    const ledger = await this.journal.ledger(account.id, { asOf, partyId: supplierId });
    const balance = Number(ledger.closingBalance);
    return {
      supplierId,
      asOf: asOf ? dateKey(asOf) : null,
      ledgerBalance: moneyText(balance),
      payable: moneyText(-balance),
      rows: ledger.rows,
    };
  }

  async supplierAging(asOf?: Date) {
    const bills = await this.prisma.supplierBill.findMany({
      where: { status: { in: ['APPROVED', 'PARTIALLY_PAID'] as any } },
    });
    const rows = await Promise.all(
      bills.map(async (bill: any) => {
        const payable = await this.supplierPayable(bill.supplierId, asOf);
        const ageDays = asOf
          ? Math.max(
              0,
              Math.floor((asOf.getTime() - new Date(bill.periodTo).getTime()) / 86_400_000),
            )
          : 0;
        const bucket =
          ageDays <= 30 ? 'CURRENT' : ageDays <= 60 ? '31_60' : ageDays <= 90 ? '61_90' : 'OVER_90';
        return {
          supplierId: bill.supplierId,
          billId: bill.id,
          periodTo: dateKey(new Date(bill.periodTo)),
          netPayable: moneyText(bill.netPayable),
          payable: payable.payable,
          ageDays,
          bucket,
        };
      }),
    );
    return { asOf: asOf ? dateKey(asOf) : null, rows };
  }

  async createAdjustment(input: any, context: RequestContext) {
    const supplierId = uuid(input?.supplierId, 'supplierId');
    const adjustmentType = this.oneOfAdjustment(input?.adjustmentType);
    const amount = money(input?.amount, 'amount');
    const adjustmentDate = dateOnly(input?.adjustmentDate, 'adjustmentDate');

    const row = await this.prisma.supplierAdjustment.create({
      data: {
        supplierId,
        adjustmentType: adjustmentType as any,
        amount,
        adjustmentDate,
        description: optionalString(input?.description, 'description'),
        status: 'OPEN' as any,
      },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'supplierAdjustment.created',
      entityType: 'SupplierAdjustment',
      entityId: row.id,
      metadata: { supplierId, adjustmentType, amount },
    });
    return this.serializeAdjustment(row);
  }

  async listAdjustments() {
    const rows = await this.prisma.supplierAdjustment.findMany({
      orderBy: { adjustmentDate: 'desc' },
    });
    return rows.map((row) => this.serializeAdjustment(row));
  }

  async recoverAdjustment(id: string, input: any, context: RequestContext) {
    const adjustment = await this.prisma.supplierAdjustment.findUnique({ where: { id } });
    if (!adjustment) throw new NotFoundError('Supplier adjustment not found.');
    if (adjustment.adjustmentType === 'BONUS') {
      throw new BusinessRuleError('Bonus adjustments cannot be recovered.');
    }
    if (adjustment.status !== 'OPEN') throw new ConflictError('Supplier adjustment is not open.');

    const remaining = roundMoney(
      Number(adjustment.amount) - Number(adjustment.recoveredAmount ?? 0),
    );
    if (remaining <= 0)
      throw new BusinessRuleError('Supplier adjustment is already fully recovered.');
    const amount =
      input?.amount === undefined ? moneyText(remaining) : money(input.amount, 'amount');
    if (Number(amount) > remaining)
      throw new BusinessRuleError('Recovery amount exceeds the outstanding balance.');

    const contraCode = adjustment.adjustmentType === 'DEDUCTION' ? '5000' : '1100';
    const resolved = await this.accounts.resolvePostingAccounts({
      eventType: 'supplier.adjustment.recovered',
      effectiveDate: new Date(adjustment.adjustmentDate),
      condition: { adjustmentType: adjustment.adjustmentType },
      fallback: { debitCode: '2000', creditCode: contraCode },
    });
    const idempotencyKey = requiredString(
      input?.idempotencyKey ?? `adjustment-recovery:${id}:${amount}`,
      'idempotencyKey',
    );

    const entry = await this.journal.postSystem(
      {
        entryDate: dateKey(new Date(adjustment.adjustmentDate)),
        description: `Supplier adjustment recovery ${id.slice(0, 8)}`,
        sourceType: 'COLLECTION',
        sourceId: id,
        idempotencyKey,
          lines: [
            {
              accountId: resolved.debitAccountId,
              debit: amount,
              credit: '0.00',
              partyType: 'SUPPLIER',
              partyId: adjustment.supplierId,
              memo: adjustment.description ?? 'Supplier adjustment recovery',
            },
            {
              accountId: resolved.creditAccountId,
              debit: '0.00',
              credit: amount,
              memo: adjustment.description ?? 'Supplier adjustment recovery',
            },
          ],

      },
      context,
    );

    const recoveredAmount = roundMoney(Number(adjustment.recoveredAmount ?? 0) + Number(amount));
    const updated = await this.prisma.supplierAdjustment.update({
      where: { id },
      data: {
        recoveredAmount: moneyText(recoveredAmount),
        status:
          recoveredAmount >= Number(adjustment.amount) - 0.005
            ? ('RECOVERED' as any)
            : ('OPEN' as any),
      },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'supplierAdjustment.recovered',
      entityType: 'SupplierAdjustment',
      entityId: id,
      metadata: { amount, journalEntryId: entry.id },
    });
    return this.serializeAdjustment(updated);
  }

  private async rateFor(grade: string, date: Date) {
    const rates = await this.prisma.teaRate.findMany({ where: { grade } });
    const rate = rates
      .filter((row: any) => new Date(row.effectiveFrom) <= date)
      .filter((row: any) => !row.effectiveTo || new Date(row.effectiveTo) >= date)
      .sort(
        (a: any, b: any) =>
          new Date(b.effectiveFrom).getTime() - new Date(a.effectiveFrom).getTime(),
      )[0];
    if (!rate)
      throw new BusinessRuleError(`No tea rate configured for grade ${grade} on ${dateKey(date)}.`);
    return rate;
  }

  private oneOfAdjustment(value: unknown): string {
    const text = requiredString(value, 'adjustmentType');
    if (!ADJUSTMENT_TYPES.includes(text as any)) {
      throw new BusinessRuleError(`Unsupported adjustmentType ${text}.`);
    }
    return text;
  }

  private serializeRate(row: any) {
    return {
      id: row.id,
      grade: row.grade,
      ratePerKg: moneyText(row.ratePerKg),
      effectiveFrom: dateKey(new Date(row.effectiveFrom)),
      effectiveTo: row.effectiveTo ? dateKey(new Date(row.effectiveTo)) : null,
      approver: row.approver ?? null,
    };
  }

  private serializeAdjustment(row: any) {
    return {
      id: row.id,
      supplierId: row.supplierId,
      adjustmentType: row.adjustmentType,
      amount: moneyText(row.amount),
      adjustmentDate: dateKey(new Date(row.adjustmentDate)),
      description: row.description ?? null,
      recoveredAmount: moneyText(row.recoveredAmount),
      status: row.status,
    };
  }
}
