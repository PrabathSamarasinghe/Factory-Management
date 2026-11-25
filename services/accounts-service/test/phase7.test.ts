import { beforeAll, describe, expect, it } from 'vitest';
import { uuidv7 } from '@galatura/platform-kit';
import { AuditService } from '../src/audit/audit.service';
import { OutboxService } from '../src/outbox/outbox.service';
import { AccountsService } from '../src/accounts/accounts.service';
import { JournalService } from '../src/journal/journal.service';
import { BillingService } from '../src/billing/billing.service';
import { PayrollService } from '../src/payroll/payroll.service';
import { PaymentsService } from '../src/payments/payments.service';
import { ReportsService } from '../src/reports/reports.service';
import { InventoryAccountsService } from '../src/inventory/inventory-accounts.service';
import { EventsService } from '../src/events/events.service';
import { createEvent } from '@galatura/platform-kit';
import { createTestPrisma } from './seed';

const maker = uuidv7();
const checker = uuidv7();
const context = { actorId: maker };
const asOf = new Date('2026-11-30T00:00:00.000Z');

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
  const inventory = new InventoryAccountsService(accounts, journal);
  const events = new EventsService(seed.prisma, billing, payroll, inventory);
  return { ...seed, audit, outbox, accounts, journal, billing, payroll, payments, reports, events };
}

async function postPair(
  journal: JournalService,
  accountIds: ReturnType<typeof createTestPrisma>['accountIds'],
  debitAccountId: string,
  creditAccountId: string,
  amount: string,
  idempotencyKey: string,
  costCentreId?: string,
) {
  return journal.postSystem(
    {
      entryDate: '2026-11-20',
      description: `Test posting ${idempotencyKey}`,
      sourceType: 'MANUAL',
      idempotencyKey,
      lines: [
        { accountId: debitAccountId, debit: amount, credit: '0.00', costCentreId },
        { accountId: creditAccountId, debit: '0.00', credit: amount, costCentreId },
      ],
    },
    context,
  );
}

beforeAll(() => {
  process.env.PLATFORM_MASTER_KEY = Buffer.alloc(32, 7).toString('base64');
});

describe('phase 7 accounting gaps', () => {
  it('reports a zero trial balance difference and reconciles snapshots with the journal', async () => {
    const { journal, prisma, accountIds, periodId } = buildServices();
    await postPair(journal, accountIds, accountIds.bank, accountIds.income, '1000.00', 'tb-income');
    await postPair(journal, accountIds, accountIds.purchases, accountIds.bank, '250.00', 'tb-expense');

    const trial = await journal.trialBalance(asOf);
    expect(trial.difference).toBe('0.00');
    expect(trial.balanced).toBe(true);
    expect(trial.checks.balanced).toBe(true);

    const snapshot = (accountId: string, debit: string, credit: string) => ({
      accountId,
      periodId,
      partyId: null,
      openingBalance: '0.00',
      periodDebit: debit,
      periodCredit: credit,
      closingBalance: (Number(debit) - Number(credit)).toFixed(2),
    });
    await prisma.accountPeriodBalance.create({
      data: snapshot(accountIds.bank, '1000.00', '250.00'),
    });
    await prisma.accountPeriodBalance.create({
      data: snapshot(accountIds.income, '0.00', '1000.00'),
    });
    await prisma.accountPeriodBalance.create({
      data: snapshot(accountIds.purchases, '250.00', '0.00'),
    });

    const healthy = await journal.nightlyIntegrity({ asOf });
    expect(healthy.ok).toBe(true);
    expect(healthy.trialBalance.difference).toBe('0.00');
    expect(healthy.snapshots.balanced).toBe(true);
    expect(healthy.metrics.accounts_integrity_snapshot_mismatches).toBe(0);

    await prisma.accountPeriodBalance.updateMany({
      where: { accountId: accountIds.bank },
      data: { periodDebit: '999.00' },
    });
    const broken = await journal.nightlyIntegrity({ asOf });
    expect(broken.ok).toBe(false);
    expect(broken.metrics.accounts_integrity_ok).toBe(0);
    expect(broken.snapshots.mismatches[0].fields).toContain('periodDebit');
  });

  it('enforces maker-checker approval and resolves rules by event, version, date and condition', async () => {
    const { accounts, accountIds } = buildServices();
    const draft = await accounts.createPostingRule(
      {
        eventType: 'payment.paid',
        version: 1,
        effectiveFrom: '2026-01-01',
        debitAccountId: accountIds.supplierAdvances,
        creditAccountId: accountIds.cash,
        conditionJson: { payeeType: 'SUPPLIER' },
      },
      { actorId: maker },
    );
    expect(draft.status).toBe('DRAFT');
    expect(draft.maker).toBe(maker);
    expect(
      await accounts.resolvePostingRule({
        eventType: 'payment.paid',
        effectiveDate: '2026-11-20',
        condition: { payeeType: 'SUPPLIER' },
      }),
    ).toBeNull();

    await expect(accounts.approvePostingRule(draft.id, { actorId: maker })).rejects.toThrow(
      /maker cannot approve/i,
    );
    const approved = await accounts.approvePostingRule(draft.id, { actorId: checker });
    expect(approved.status).toBe('APPROVED');
    expect(approved.approver).toBe(checker);
    await expect(accounts.approvePostingRule(draft.id, { actorId: checker })).rejects.toThrow(
      /Only draft or disabled/,
    );

    const laterRule = await accounts.createPostingRule(
      {
        eventType: 'payment.paid',
        version: 2,
        effectiveFrom: '2026-12-01',
        debitAccountId: accountIds.inventory,
        creditAccountId: accountIds.bank,
        conditionJson: { payeeType: 'SUPPLIER' },
      },
      { actorId: checker },
    );
    await accounts.approvePostingRule(laterRule.id, { actorId: maker });

    const query = {
      eventType: 'payment.paid',
      condition: { payeeType: 'SUPPLIER' },
    };
    const current = await accounts.resolvePostingRule({
      ...query,
      effectiveDate: '2026-11-20',
    });
    expect(current?.version).toBe(1);
    const future = await accounts.resolvePostingRule({ ...query, effectiveDate: '2026-12-05' });
    expect(future?.version).toBe(2);
    const pinned = await accounts.resolvePostingRule({
      ...query,
      effectiveDate: '2026-12-05',
      version: 1,
    });
    expect(pinned?.debitAccountId).toBe(accountIds.supplierAdvances);
    expect(
      await accounts.resolvePostingRule({
        eventType: 'payment.paid',
        effectiveDate: '2026-12-05',
        condition: { payeeType: 'EMPLOYEE' },
      }),
    ).toBeNull();

    await accounts.disablePostingRule(laterRule.id, { actorId: maker });
    const afterDisable = await accounts.resolvePostingRule({
      ...query,
      effectiveDate: '2026-12-05',
    });
    expect(afterDisable?.version).toBe(1);
  });

  it('uses approved rules in business postings and falls back to hard-coded accounts', async () => {
    const { accounts, payments, prisma, accountIds, supplierId, personId } = buildServices();
    const rule = await accounts.createPostingRule(
      {
        eventType: 'payment.paid',
        version: 1,
        effectiveFrom: '2026-01-01',
        debitAccountId: accountIds.supplierAdvances,
        creditAccountId: accountIds.cash,
        conditionJson: { payeeType: 'SUPPLIER' },
      },
      { actorId: maker },
    );
    await accounts.approvePostingRule(rule.id, { actorId: checker });

    const supplierPayment = await payments.createPayment(
      {
        payeeType: 'SUPPLIER',
        payeeId: supplierId,
        amount: '250.00',
        idempotencyKey: 'rule-payment',
      },
      context,
    );
    const paid = await payments.markPaymentPaid(
      supplierPayment.payment.id,
      { paidDate: '2026-11-20', idempotencyKey: 'rule-payment-paid' },
      context,
    );
    const supplierLines = prisma.__stores.journalLine.filter(
      (line: any) => line.entryId === paid.journalEntryId,
    );
    expect(supplierLines.map((line: any) => line.accountId)).toEqual([
      accountIds.supplierAdvances,
      accountIds.cash,
    ]);

    const employeePayment = await payments.createPayment(
      {
        payeeType: 'EMPLOYEE',
        payeeId: personId,
        amount: '100.00',
        idempotencyKey: 'fallback-payment',
      },
      context,
    );
    const employeePaid = await payments.markPaymentPaid(
      employeePayment.payment.id,
      { paidDate: '2026-11-20', idempotencyKey: 'fallback-payment-paid' },
      context,
    );
    const fallbackLines = prisma.__stores.journalLine.filter(
      (line: any) => line.entryId === employeePaid.journalEntryId,
    );
    expect(fallbackLines.map((line: any) => line.accountId)).toEqual([
      accountIds.wagesPayable,
      accountIds.bank,
    ]);
  });

  it('resolves inventory posting accounts from event rules with a payload fallback', async () => {
    const { accounts, events, prisma, accountIds } = buildServices();
    const rule = await accounts.createPostingRule(
      {
        eventType: 'inventory.issue.posted',
        version: 1,
        effectiveFrom: '2026-01-01',
        debitAccountId: accountIds.purchases,
        creditAccountId: accountIds.inventory,
        conditionJson: { debitAccountCode: '5030', creditAccountCode: '1210' },
      },
      { actorId: maker },
    );
    await accounts.approvePostingRule(rule.id, { actorId: checker });

    const event = createEvent({
      type: 'inventory.issue.posted',
      version: 1,
      actor: { type: 'USER', id: checker },
      payload: {
        issueId: uuidv7(),
        issueDate: '2026-11-24',
        issuedToType: 'DEPARTMENT',
        issuedToId: uuidv7(),
        purpose: 'Factory issue',
        lines: [
          {
            itemId: uuidv7(),
            qty: '2.000',
            unitCost: '20.00',
            value: '40.00',
            expenseAccountCode: '5030',
            inventoryAccountCode: '1210',
          },
        ],
        totalValue: '40.00',
        approvedBy: checker,
        approvedAt: '2026-11-24T09:30:00.000Z',
      },
    });
    expect((await events.ingest(event)).status).toBe('processed');
    const entry = prisma.__stores.journalEntry.find((row: any) => row.sourceType === 'INVENTORY');
    const lines = prisma.__stores.journalLine.filter((line: any) => line.entryId === entry.id);
    expect(lines.map((line: any) => line.accountId)).toEqual([
      accountIds.purchases,
      accountIds.inventory,
    ]);
  });

  it('builds statements with equity changes, budget variance, comparatives and cost centres', async () => {
    const { journal, prisma, reports, accountIds, periodId } = buildServices();
    const costCentreId = uuidv7();
    await postPair(
      journal,
      accountIds,
      accountIds.bank,
      accountIds.income,
      '1000.00',
      'statement-income',
      costCentreId,
    );
    await postPair(journal, accountIds, accountIds.purchases, accountIds.bank, '250.00', 'statement-expense');
    const budget = await prisma.budget.create({
      data: { name: '5000', fiscalPeriodId: periodId, totalAmount: '300.00' },
    });
    const periodFrom = new Date('2026-11-01T00:00:00.000Z');
    const periodTo = new Date('2026-11-30T00:00:00.000Z');

    const profitLoss = await reports.profitLoss({ from: periodFrom, to: periodTo });
    expect(profitLoss.profit).toBe('750.00');
    expect(profitLoss.rows.find((row: any) => row.code === '4000').drill).toBe(
      `/ledger/${accountIds.income}`,
    );
    const filtered = await reports.profitLoss({
      from: periodFrom,
      to: periodTo,
      costCentreId,
    });
    expect(filtered.profit).toBe('1000.00');
    const grouped = await reports.profitLoss({ from: periodFrom, to: periodTo, level: 'section' });
    expect(grouped.rows.some((row: any) => row.id === 'INCOME')).toBe(true);
    const comparative = await reports.profitLoss({
      from: new Date('2026-11-01'),
      to: new Date('2026-11-30'),
      compare: 'previous-period',
    });
    expect(comparative.columns).toContain('Previous period');
    expect((comparative as any).comparison.mode).toBe('PREVIOUS_PERIOD');
    expect(comparative.rows[0].values).toHaveLength(3);

    const trialBalance = await reports.trialBalance({ asOf, level: 'section' });
    expect(trialBalance.level).toBe('SECTION');
    expect(trialBalance.balanced).toBe(true);
    const balanceSheet = await reports.balanceSheet({ asOf });
    expect(balanceSheet.currentYearProfit).toBe('750.00');
    expect(balanceSheet.balanced).toBe(true);
    const equity = await reports.equityChanges({ from: periodFrom, to: periodTo });
    expect(equity.profitForPeriod).toBe('750.00');
    expect(equity.checks.balanced).toBe(true);
    const budgetVsActual = await reports.budgetVsActual({
      from: periodFrom,
      to: periodTo,
      budgetId: budget.id,
    });
    expect(budgetVsActual.rows[0].actual).toBe('250.00');
    expect(budgetVsActual.rows[0].variance).toBe('50.00');
  });

  it('keeps the report to ledger to journal to source document chain usable', async () => {
    const { journal, payments, accountIds, supplierId } = buildServices();
    const payment = await payments.createPayment(
      {
        payeeType: 'SUPPLIER',
        payeeId: supplierId,
        amount: '250.00',
        idempotencyKey: 'drill-payment',
      },
      context,
    );
    const paid = await payments.markPaymentPaid(
      payment.payment.id,
      { paidDate: '2026-11-20', idempotencyKey: 'drill-payment-paid' },
      context,
    );
    const trial = await journal.trialBalance(asOf);
    const bankRow = trial.rows.find((row: any) => row.code === '1010');
    expect(bankRow.drill).toBe(`/ledger/${accountIds.bank}`);

    const ledger = await journal.ledger(accountIds.bank, { asOf });
    const ledgerRow = ledger.rows.find((row: any) => row.entryId === paid.journalEntryId);
    expect(ledgerRow.drill).toBe(`/journal-entries/${paid.journalEntryId}`);
    const entry = await journal.getEntry(paid.journalEntryId);
    expect(entry.sourceDrill).toBe(`/journal-entries/${paid.journalEntryId}/source`);
    const source = await journal.sourceDocument(paid.journalEntryId);
    expect(source.source.type).toBe('PAYMENT');
    expect(source.source.id).toBe(payment.payment.id);
    expect(source.drill).toBe(`/payments/${payment.payment.id}`);

    const tAccount = await journal.tAccount(accountIds.bank, asOf);
    expect(tAccount.rows.some((row: any) => row.entryId === paid.journalEntryId)).toBe(true);
  });

  it('closes a fiscal year with current profit moved to retained earnings', async () => {
    const { journal, prisma, accountIds, fiscalYearId } = buildServices();
    await postPair(journal, accountIds, accountIds.bank, accountIds.income, '1000.00', 'close-income');
    await postPair(journal, accountIds, accountIds.purchases, accountIds.bank, '250.00', 'close-expense');

    const closed = await journal.closeFiscalYear(
      { fiscalYearId, closingDate: '2026-12-31' },
      { actorId: checker },
    );
    expect(closed.profitForYear).toBe('750.00');
    expect(prisma.__stores.fiscalYear[0].status).toBe('CLOSED');
    const closingLines = prisma.__stores.journalLine.filter(
      (line: any) => line.entryId === closed.journalEntryId,
    );
    expect(closingLines.some((line: any) => line.accountId === accountIds.retainedEarnings && Number(line.credit) === 750)).toBe(true);
    expect(closingLines.some((line: any) => line.accountId === accountIds.income && Number(line.debit) === 1000)).toBe(true);
    expect(closingLines.some((line: any) => line.accountId === accountIds.purchases && Number(line.credit) === 250)).toBe(true);

    await expect(
      journal.postSystem(
        {
          entryDate: '2026-11-25',
          description: 'Too late',
          sourceType: 'MANUAL',
          idempotencyKey: 'close-after',
          lines: [
            { accountId: accountIds.bank, debit: '10.00', credit: '0.00' },
            { accountId: accountIds.income, debit: '0.00', credit: '10.00' },
          ],
        },
        context,
      ),
    ).rejects.toThrow(/(locked|closed)/i);

    const balanceSheet = await journal.balanceSheet(new Date('2026-12-31T00:00:00.000Z'));
    expect(balanceSheet.currentYearProfit).toBe('0.00');
    expect(balanceSheet.equity).toBe('750.00');
    expect(balanceSheet.balanced).toBe(true);
  });

  it('protects posted accounts from deletion and supports the opening-balance flow', async () => {
    const { accounts, journal, prisma, accountIds } = buildServices();
    const created = await accounts.createAccount(
      {
        code: '9999',
        name: 'Unused suspense',
        accountType: 'ASSET',
        normalBalance: 'DEBIT',
      },
      context,
    );
    await accounts.updateAccount(created.id, { name: 'Unused suspense moved' }, context);
    expect((await accounts.deleteAccount(created.id, context)).deleted).toBe(true);
    expect(await prisma.account.findUnique({ where: { id: created.id } })).toBeNull();

    const opening = await journal.postOpening(
      {
        entryDate: '2026-11-01',
        description: 'Opening balances',
        idempotencyKey: 'opening-gap-test',
        lines: [
          { accountId: accountIds.bank, debit: '1000.00', credit: '0.00' },
          { accountId: accountIds.capital, debit: '0.00', credit: '1000.00' },
        ],
      },
      context,
    );
    expect(opening.status).toBe('POSTED');
    expect((await prisma.account.findUnique({ where: { id: accountIds.bank } })).openingBalanceEntryId).toBe(
      opening.id,
    );
    await expect(accounts.deleteAccount(accountIds.bank, context)).rejects.toThrow(/postings/i);
  });
});
