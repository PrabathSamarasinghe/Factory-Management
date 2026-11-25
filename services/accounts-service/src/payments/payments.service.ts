import { Injectable } from '@nestjs/common';
import { BusinessRuleError, ConflictError, NotFoundError } from '@galatura/platform-kit';
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
  requiredArray,
  requiredString,
  roundMoney,
  uuid,
} from '../common/validation';
import { exportReference, serializePayment } from '../common/serialize';

const BATCH_TYPES = ['SUPPLIER', 'WAGES', 'OTHER'] as const;
const PAYMENT_METHODS = ['BANK_FILE', 'BANK_TRANSFER', 'CASH', 'CHEQUE'] as const;
const PAYEE_TYPES = ['SUPPLIER', 'EMPLOYEE', 'OTHER'] as const;

@Injectable()
export class PaymentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly accounts: AccountsService,
    private readonly journal: JournalService,
  ) {}

  async listBatches() {
    const rows = await this.prisma.paymentBatch.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((row) => this.serializeBatch(row));
  }

  async createBatch(input: any, context: RequestContext) {
    const batchType = this.oneOf(input?.batchType, BATCH_TYPES, 'batchType');
    const paymentMethod = this.oneOf(input?.paymentMethod, PAYMENT_METHODS, 'paymentMethod');
    const rawPayments = requiredArray(input?.payments, 'payments');
    const reference = optionalString(input?.reference, 'reference');

    const payments = rawPayments.map((raw: any) => ({
      payeeType: this.oneOf(raw?.payeeType, PAYEE_TYPES, 'payment.payeeType'),
      payeeId: uuid(raw?.payeeId, 'payment.payeeId'),
      amount: money(raw?.amount, 'payment.amount'),
      reference: optionalString(raw?.reference, 'payment.reference'),
      billId: raw?.billId ? uuid(raw.billId, 'payment.billId') : undefined,
      payrollItemId: raw?.payrollItemId
        ? uuid(raw.payrollItemId, 'payment.payrollItemId')
        : undefined,
    }));
    const totalAmount = roundMoney(
      payments.reduce((sum, payment) => sum + Number(payment.amount), 0),
    );

    const batch = await this.prisma.$transaction(async (tx: any) => {
      const created = await tx.paymentBatch.create({
        data: {
          batchType: batchType as any,
          paymentMethod: paymentMethod as any,
          totalAmount: moneyText(totalAmount),
          status: 'DRAFT',
          reference,
          createdBy: context.actorId,
        },
      });
      for (const payment of payments) {
        await tx.payment.create({
          data: {
            batchId: created.id,
            payeeType: payment.payeeType,
            payeeId: payment.payeeId,
            amount: payment.amount,
            paymentMethod: paymentMethod as any,
            reference: payment.reference,
            billId: payment.billId,
            payrollItemId: payment.payrollItemId,
            status: 'PENDING' as any,
            idempotencyKey: `batch:${created.id}:${payment.payeeId}:${payment.amount}`,
          },
        });
      }
      await this.audit.record(
        {
          actorId: context.actorId,
          action: 'paymentBatch.created',
          entityType: 'PaymentBatch',
          entityId: created.id,
          metadata: { payments: payments.length, totalAmount: moneyText(totalAmount) },
        },
        tx,
      );
      return created;
    });

    return this.serializeBatch(batch);
  }

  async approveBatch(id: string, input: any, context: RequestContext) {
    const batch = await this.prisma.paymentBatch.findUnique({ where: { id } });
    if (!batch) throw new NotFoundError('Payment batch not found.');
    if (batch.status !== 'DRAFT') throw new ConflictError('Payment batch is not a draft.');
    const payments = await this.prisma.payment.findMany({ where: { batchId: id } });
    if (payments.length === 0) throw new BusinessRuleError('Payment batch has no payments.');

    const objectKey = exportReference('payment-batch', 'csv');
    const updated = await this.prisma.paymentBatch.update({
      where: { id },
      data: {
        status: 'APPROVED',
        approvedBy: context.actorId,
        approvedAt: new Date(),
        fileObjectKey: objectKey,
      },
    });
    await this.prisma.payment.updateMany({
      where: { batchId: id, status: 'PENDING' as any },
      data: { status: 'APPROVED' as any },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'paymentBatch.approved',
      entityType: 'PaymentBatch',
      entityId: id,
      metadata: { objectKey },
    });
    return this.serializeBatch(updated);
  }

  async bankFile(id: string) {
    const batch = await this.prisma.paymentBatch.findUnique({ where: { id } });
    if (!batch) throw new NotFoundError('Payment batch not found.');
    if (batch.status !== 'APPROVED' && batch.status !== 'PAID') {
      throw new ConflictError('Payment batch must be approved before export.');
    }
    const payments = await this.prisma.payment.findMany({ where: { batchId: id } });
    const content = [
      'payment_id,payee_type,payee_id,amount,reference,method',
      ...payments.map((payment: any) =>
        [
          payment.id,
          payment.payeeType,
          payment.payeeId,
          moneyText(payment.amount),
          payment.reference ?? '',
          payment.paymentMethod,
        ]
          .map((value) => `"${String(value).replace(/"/g, '""')}"`)
          .join(','),
      ),
    ].join('\n');

    return {
      batchId: id,
      objectKey: batch.fileObjectKey ?? exportReference('payment-batch', 'csv'),
      format: 'CSV',
      contentType: 'text/csv',
      content,
      rows: payments.length,
    };
  }

  async listPayments() {
    const rows = await this.prisma.payment.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((row) => serializePayment(row));
  }

  async createPayment(input: any, context: RequestContext) {
    const payeeType = this.oneOf(input?.payeeType, PAYEE_TYPES, 'payeeType');
    const payeeId = uuid(input?.payeeId, 'payeeId');
    const amount = money(input?.amount, 'amount');
    const paymentMethod = input?.paymentMethod
      ? this.oneOf(input.paymentMethod, PAYMENT_METHODS, 'paymentMethod')
      : 'BANK_TRANSFER';
    const idempotencyKey = requiredString(input?.idempotencyKey, 'idempotencyKey');
    const batchId = input?.batchId ? uuid(input.batchId, 'batchId') : undefined;
    const billId = input?.billId ? uuid(input.billId, 'billId') : undefined;
    const payrollItemId = input?.payrollItemId
      ? uuid(input.payrollItemId, 'payrollItemId')
      : undefined;

    const existing = await this.prisma.payment.findUnique({ where: { idempotencyKey } });
    if (existing) return { payment: serializePayment(existing), duplicate: true };

    const row = await this.prisma.payment.create({
      data: {
        batchId,
        payeeType,
        payeeId,
        amount,
        paymentMethod: paymentMethod as any,
        reference: optionalString(input?.reference, 'reference'),
        billId,
        payrollItemId,
        status: 'PENDING' as any,
        idempotencyKey,
      },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'payment.created',
      entityType: 'Payment',
      entityId: row.id,
      metadata: { payeeType, amount },
    });
    return { payment: serializePayment(row), duplicate: false };
  }

  async markPaymentPaid(id: string, input: any, context: RequestContext) {
    const payment = await this.prisma.payment.findUnique({ where: { id } });
    if (!payment) throw new NotFoundError('Payment not found.');
    if (payment.status === 'PAID') return serializePayment(payment);
    if (payment.status === 'CANCELLED' || payment.status === 'FAILED') {
      throw new ConflictError('Payment cannot be marked as paid.');
    }

    const paidDate = input?.paidDate ? dateOnly(input.paidDate, 'paidDate') : new Date();
    const reference = optionalString(input?.reference, 'reference');
    const idempotencyKey = requiredString(
      input?.idempotencyKey ?? `payment-paid:${id}`,
      'idempotencyKey',
    );
    const payableCode = payment.payeeType === 'EMPLOYEE' ? '2010' : '2000';
    const resolved = await this.accounts.resolvePostingAccounts({
      eventType: 'payment.paid',
      effectiveDate: paidDate,
      condition: { payeeType: payment.payeeType },
      fallback: { debitCode: payableCode, creditCode: '1010' },
    });
    const entry = await this.journal.postSystem(
      {
        entryDate: dateKey(paidDate),
        description: `Payment to ${payment.payeeType.toLowerCase()} ${payment.payeeId.slice(0, 8)}`,
        sourceType: 'SUPPLIER_PAYMENT',
        sourceId: payment.id,
        idempotencyKey,
          lines: [
            {
              accountId: resolved.debitAccountId,
              debit: moneyText(payment.amount),
              credit: '0.00',
              partyType: payment.payeeType,
              partyId: payment.payeeId,
              memo: reference ?? 'Payment settlement',
            },
            {
              accountId: resolved.creditAccountId,
              debit: '0.00',
              credit: moneyText(payment.amount),
              memo: reference ?? 'Payment settlement',
            },
          ],

      },
      context,
    );

    const updated = await this.prisma.payment.update({
      where: { id },
      data: {
        status: 'PAID' as any,
        paidDate,
        paidBy: context.actorId,
        reference: reference ?? payment.reference,
        journalEntryId: entry.id,
      },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'payment.marked_paid',
      entityType: 'Payment',
      entityId: id,
      metadata: { journalEntryId: entry.id, amount: moneyText(payment.amount) },
    });
    await this.outbox.append(
      'payment.paid',
      {
        paymentId: id,
        payeeType: payment.payeeType,
        payeeId: payment.payeeId,
        amount: moneyText(payment.amount),
        paidDate: dateKey(paidDate),
        journalEntryId: entry.id,
      },
      { type: 'USER', id: context.actorId ?? 'system' },
    );
    return serializePayment(updated);
  }

  private oneOf(value: unknown, values: readonly string[], label: string): string {
    const text = requiredString(value, label);
    if (!values.includes(text))
      throw new BusinessRuleError(`${label} must be one of ${values.join(', ')}.`);
    return text;
  }

  private serializeBatch(row: any) {
    return {
      id: row.id,
      batchType: row.batchType,
      paymentMethod: row.paymentMethod,
      totalAmount: moneyText(row.totalAmount),
      status: row.status,
      reference: row.reference ?? null,
      approvedBy: row.approvedBy ?? null,
      approvedAt: row.approvedAt ? new Date(row.approvedAt).toISOString() : null,
      fileObjectKey: row.fileObjectKey ?? null,
    };
  }
}
