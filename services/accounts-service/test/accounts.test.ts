import { beforeAll, describe, expect, it } from 'vitest';
import { createEvent, uuidv7 } from '@galatura/platform-kit';
import { AuditService } from '../src/audit/audit.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { AccountsService } from '../src/accounts/accounts.service';
import { JournalService } from '../src/journal/journal.service';
import { BillingService } from '../src/billing/billing.service';
import { PayrollService } from '../src/payroll/payroll.service';
import { PaymentsService } from '../src/payments/payments.service';
import { ReportsService } from '../src/reports/reports.service';
import { ReconciliationService } from '../src/reconciliation/reconciliation.service';
import { EventsService } from '../src/events/events.service';
import { InventoryAccountsService } from '../src/inventory/inventory-accounts.service';
import { createTestPrisma } from './seed';

const context = { actorId: uuidv7() };

function buildServices() {
  const seed = createTestPrisma();
  const audit = new AuditService(seed.prisma);
  const outbox = new OutboxService(seed.prisma);
  const accounts = new AccountsService(seed.prisma, audit, outbox);
  const journal = new JournalService(seed.prisma, audit, outbox, accounts);
  const billing = new BillingService(seed.prisma, audit, outbox, accounts, journal);
  const payroll = new PayrollService(seed.prisma, audit, accounts, journal);
  const payments = new PaymentsService(seed.prisma, audit, outbox, accounts, journal);
  const reports = new ReportsService(journal, billing);
  const reconciliation = new ReconciliationService(seed.prisma, audit);
  const inventory = new InventoryAccountsService(accounts, journal);
  const events = new EventsService(seed.prisma, billing, payroll, inventory);

  return {
    ...seed,
    audit,
    outbox,
    accounts,
    journal,
    billing,
    payroll,
    payments,
    reports,
    reconciliation,
    events,
  };
}

beforeAll(() => {
  process.env.PLATFORM_MASTER_KEY = Buffer.alloc(32, 7).toString('base64');
});

describe('accounts-service', () => {
  it('posts balanced journals, rejects unbalanced drafts, and posts reversals', async () => {
    const { journal, accountIds } = buildServices();

    const draft = await journal.createDraft(
      {
        entryDate: '2026-11-20',
        description: 'Test posting',
        idempotencyKey: 'journal-test-1',
        lines: [
          { accountId: accountIds.inventory, debit: '100.00', credit: '0.00' },
          { accountId: accountIds.income, debit: '0.00', credit: '100.00' },
        ],
      },
      context,
    );

    const posted = await journal.post(draft.id, { idempotencyKey: 'journal-post-1' }, context);
    expect(posted.status).toBe('POSTED');
    expect(posted.debitTotal).toBe('100.00');
    expect(posted.creditTotal).toBe('100.00');

    const reversed = await journal.reverse(posted.id, { reason: 'Test reversal' }, context);
    expect(reversed.status).toBe('POSTED');
    expect((await journal.getEntry(posted.id)).status).toBe('REVERSED');

    await expect(
      journal.createDraft(
        {
          entryDate: '2026-11-20',
          description: 'Unbalanced',
          idempotencyKey: 'journal-test-2',
          lines: [{ accountId: accountIds.inventory, debit: '50.00', credit: '0.00' }],
        },
        context,
      ),
    ).rejects.toThrow(/debits must equal credits/);
  });

  it('generates and approves supplier bills from collected totals', async () => {
    const { prisma, billing, supplierId } = buildServices();
    await prisma.collectedTotal.create({
      data: {
        eventId: uuidv7(),
        supplierId,
        collectionDate: new Date('2026-11-10'),
        totalNetKg: '100.000',
        grade: 'STANDARD',
        dailyTotalId: uuidv7(),
        processed: false,
      },
    });

    const generated = await billing.generateBills(
      {
        periodFrom: '2026-11-01',
        periodTo: '2026-11-30',
        idempotencyKey: 'bill-test-1',
      },
      context,
    );
    expect(generated.bills).toHaveLength(1);
    expect(generated.bills[0].netPayable).toBe('5000.00');

    const approved = await billing.approveBill(
      generated.bills[0].id,
      { idempotencyKey: 'bill-approve-test-1' },
      context,
    );
    expect(approved.status).toBe('APPROVED');
    expect(approved.journalEntryId).toBeTruthy();
  });

  it('calculates and approves payroll with EPF and ETF components', async () => {
    const { prisma, payroll, personId } = buildServices();
    await prisma.attendanceDay.create({
      data: {
        eventId: uuidv7(),
        personId,
        workDate: new Date('2026-11-10'),
        status: 'PRESENT',
        workedMinutes: 480,
        overtimeMinutes: 60,
        approved: true,
      },
    });

    const calculated = await payroll.calculatePayroll(
      {
        periodFrom: '2026-11-01',
        periodTo: '2026-11-30',
        runType: 'MONTHLY',
        idempotencyKey: 'payroll-test-1',
        employees: [{ personId, dailyWage: '1000.00' }],
      },
      context,
    );
    expect(calculated.run.status).toBe('CALCULATED');
    expect(Number(calculated.run.items[0].grossAmount)).toBeGreaterThan(1000);
    expect(Number(calculated.run.items[0].etf)).toBeGreaterThan(0);

    const approved = await payroll.approvePayrollRun(
      calculated.run.id,
      { idempotencyKey: 'payroll-approve-test-1' },
      context,
    );
    expect(approved.status).toBe('APPROVED');
  });

  it('posts payments when marked paid and emits payment.paid', async () => {
    const { prisma, payments, supplierId } = buildServices();
    const created = await payments.createPayment(
      {
        payeeType: 'SUPPLIER',
        payeeId: supplierId,
        amount: '250.00',
        paymentMethod: 'BANK_TRANSFER',
        idempotencyKey: 'payment-test-1',
      },
      context,
    );

    const paid = await payments.markPaymentPaid(
      created.payment.id,
      { paidDate: '2026-11-20', reference: 'REF-1', idempotencyKey: 'payment-paid-test-1' },
      context,
    );
    expect(paid.status).toBe('PAID');
    expect(paid.journalEntryId).toBeTruthy();
    expect(
      prisma.__stores.outboxEvent.some((row: any) => row.envelope.type === 'payment.paid'),
    ).toBe(true);
  });

  it('exports PDF and XLSX reports from the backend', async () => {
    const { reports } = buildServices();

    const pdf = await reports.export('trial-balance', 'pdf', {});
    expect(pdf.content.subarray(0, 4).toString()).toBe('%PDF');

    const xlsx = await reports.export('trial-balance', 'xlsx', {});
    expect(xlsx.content.subarray(0, 2).toString()).toBe('PK');
  });

  it('encrypts bank accounts, reconciles statement lines, and deduplicates events', async () => {
    const { prisma, reconciliation, events, accountIds, supplierId } = buildServices();

    const bankAccount = await reconciliation.createBankAccount(
      {
        bankName: 'Test Bank',
        accountNumber: '1234567890',
        ledgerAccountId: accountIds.bank,
      },
      context,
    );
    expect(bankAccount.accountNumberMasked).toBe('******7890');
    expect(prisma.__stores.companyBankAccount[0].accountNumberEnc).not.toContain('1234567890');

    const reconciliationRow = await reconciliation.createReconciliation(
      {
        bankAccountId: bankAccount.id,
        statementDate: '2026-11-30',
        statementBalance: '100.00',
      },
      context,
    );
    const statementLine = await reconciliation.addReconciliationLine(
      reconciliationRow.id,
      {
        statementLineDate: '2026-11-20',
        description: 'Supplier payment',
        amount: '100.00',
        direction: 'DEBIT',
      },
      context,
    );
    const journalLine = await prisma.journalLine.create({
      data: {
        entryId: uuidv7(),
        accountId: accountIds.bank,
        debit: '100.00',
        credit: '0.00',
        lineNo: 1,
      },
    });
    const matched = await reconciliation.matchReconciliation(
      reconciliationRow.id,
      { lineId: statementLine.id, journalLineId: journalLine.id },
      context,
    );
    expect(matched.reconciliation.status).toBe('COMPLETE');

    const event = createEvent({
      type: 'collection.finalized',
      version: 1,
      actor: { type: 'SERVICE', id: 'collection-service' },
      payload: {
        dailyTotalId: uuidv7(),
        tripId: uuidv7(),
        supplierId,
        collectionDate: '2026-11-10',
        totalNetKg: '25.000',
        totalBags: 5,
        finalizedAt: '2026-11-10T12:00:00.000Z',
        finalizedBy: uuidv7(),
      },
    });
    expect((await events.ingest(event)).status).toBe('processed');
    expect((await events.ingest(event)).status).toBe('duplicate');
  });

  it('posts inventory purchase and issue events to balanced journals and dedupes them', async () => {
    const { prisma, events } = buildServices();
    const receiptId = uuidv7();
    const issueId = uuidv7();
    const itemId = uuidv7();
    const vendorId = uuidv7();
    const approvedBy = uuidv7();
    const approvedAt = '2026-11-24T09:30:00.000Z';

    const purchase = createEvent({
      type: 'inventory.purchase.received',
      version: 1,
      actor: { type: 'USER', id: approvedBy },
      payload: {
        receiptId,
        vendorId,
        receivedDate: '2026-11-24',
        reference: 'GR-1024',
        lines: [
          {
            itemId,
            qty: '12.500',
            unitCost: '20.00',
            value: '250.00',
            inventoryAccountCode: '1210',
            payableAccountCode: '2050',
          },
        ],
        totalValue: '250.00',
        approvedBy,
        approvedAt,
      },
    });
    expect((await events.ingest(purchase)).status).toBe('processed');
    expect((await events.ingest(purchase)).status).toBe('duplicate');

    const issue = createEvent({
      type: 'inventory.issue.posted',
      version: 1,
      actor: { type: 'USER', id: approvedBy },
      payload: {
        issueId,
        issueDate: '2026-11-24',
        issuedToType: 'DEPARTMENT',
        issuedToId: uuidv7(),
        purpose: 'Factory issue',
        lines: [
          {
            itemId,
            qty: '2.000',
            unitCost: '20.00',
            value: '40.00',
            expenseAccountCode: '5030',
            inventoryAccountCode: '1210',
          },
        ],
        totalValue: '40.00',
        approvedBy,
        approvedAt,
      },
    });
    expect((await events.ingest(issue)).status).toBe('processed');
    expect((await events.ingest(issue)).status).toBe('duplicate');

    const entries = prisma.__stores.journalEntry as Array<Record<string, any>>;
    expect(entries).toHaveLength(2);
    expect(
      entries.every((entry) => entry.sourceType === 'INVENTORY' && entry.status === 'POSTED'),
    ).toBe(true);
  });
});
