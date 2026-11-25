import { Injectable } from '@nestjs/common';
import { BusinessRuleError, ConflictError, NotFoundError, uuidv7 } from '@galatura/platform-kit';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestContext } from '../common/request';
import {
  dateKey,
  dateOnly,
  money,
  optionalString,
  optionalUuid,
  requiredArray,
  requiredString,
  roundMoney,
  uuid,
} from '../common/validation';
import {
  moneyText,
  serializeJournalEntry,
  serializeJournalLine,
  toDateOnly,
} from '../common/serialize';
import { AccountsService } from '../accounts/accounts.service';

const SOURCE_TYPES = [
  'MANUAL',
  'COLLECTION',
  'PAYROLL',
  'SUPPLIER_PAYMENT',
  'INVENTORY',
  'REVERSAL',
  'OPENING',
  'YEAR_END',
] as const;
const COMPARISONS = ['NONE', 'PREVIOUS_PERIOD', 'PREVIOUS_YEAR'] as const;
const LEVELS = ['ACCOUNT', 'SECTION', 'TYPE'] as const;

export interface StatementOptions {
  asOf?: Date;
  from?: Date;
  to?: Date;
  periodId?: string;
  compare?: string;
  costCentreId?: string;
  level?: string;
  budgetId?: string;
}

export interface JournalLineInput {
  accountId?: unknown;
  debit?: unknown;
  credit?: unknown;
  partyType?: unknown;
  partyId?: unknown;
  costCentreId?: unknown;
  memo?: unknown;
}

export interface PostingInput {
  entryDate?: unknown;
  description?: unknown;
  sourceType?: unknown;
  sourceId?: unknown;
  idempotencyKey?: unknown;
  lines?: unknown;
}

interface NormalizedLine {
  accountId: string;
  debit: string;
  credit: string;
  partyType?: string;
  partyId?: string;
  costCentreId?: string;
  memo?: string;
}

@Injectable()
export class JournalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly accounts: AccountsService,
  ) {}

  async listEntries(status?: string) {
    const rows = await this.prisma.journalEntry.findMany(
      (status
        ? { where: { status: status as any }, orderBy: { entryDate: 'desc' } }
        : { orderBy: { entryDate: 'desc' } }) as any,
    );
    return rows.map((row) => serializeJournalEntry(row));
  }

  async getEntry(id: string) {
    const row = await this.prisma.journalEntry.findUnique({ where: { id } });
    if (!row) throw new NotFoundError('Journal entry not found.');
    const lines = await this.prisma.journalLine.findMany({
      where: { entryId: id },
      orderBy: { lineNo: 'asc' },
    });
    return serializeJournalEntry(row, lines);
  }

  async createDraft(input: PostingInput, context: RequestContext) {
    return this.createEntry(input, context, false);
  }

  async post(id: string, input: any, context: RequestContext) {
    const entry = await this.prisma.journalEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundError('Journal entry not found.');
    if (entry.status === 'POSTED') return this.getEntry(id);
    if (entry.status === 'REVERSED') throw new ConflictError('Reversed entries cannot be posted.');

    const lines = await this.prisma.journalLine.findMany({ where: { entryId: id } });
    if (lines.length === 0) throw new BusinessRuleError('Journal entry has no lines.');
    this.assertBalanced(lines);
    await this.accounts.assertPeriodOpen(entry.periodId);

    const postedAt = new Date();
    await this.prisma.$transaction(async (tx: any) => {
      await tx.journalEntry.update({
        where: { id },
        data: {
          status: 'POSTED' as const,
          postedBy: context.actorId,
          postedAt,
          approvedBy: context.actorId,
          approvedAt: postedAt,
        },
      });
      await this.updatePeriodBalances(tx, entry.periodId, lines);
      await this.audit.record(
        {
          actorId: context.actorId,
          action: 'journal.posted',
          entityType: 'JournalEntry',
          entityId: id,
          metadata: { entryNo: entry.entryNo },
        },
        tx,
      );
      await this.outbox.append(
        'journal.posted',
        {
          journalEntryId: id,
          entryNo: entry.entryNo,
          entryDate: dateKey(entry.entryDate),
          periodId: entry.periodId,
          debitTotal: moneyText(lines.reduce((sum, line) => sum + Number(line.debit), 0)),
          creditTotal: moneyText(lines.reduce((sum, line) => sum + Number(line.credit), 0)),
          sourceType: entry.sourceType,
          sourceId: entry.sourceId ?? null,
        },
        { type: 'USER', id: context.actorId ?? 'system' },
        tx,
      );
    });

    return this.getEntry(id);
  }

  async postSystem(input: PostingInput, context: RequestContext) {
    const entry = await this.createEntry(input, context, true);
    return this.post(entry.id, input, context);
  }

  async postSystemWithContext(input: PostingInput, context: RequestContext, periodId?: string) {
    const entry = await this.createEntry(input, context, true, periodId);
    return this.post(entry.id, input, context);
  }

  async reverse(id: string, input: any, context: RequestContext) {
    const original = await this.prisma.journalEntry.findUnique({ where: { id } });
    if (!original) throw new NotFoundError('Journal entry not found.');
    if (original.status !== 'POSTED')
      throw new ConflictError('Only posted entries can be reversed.');

    const idempotencyKey = `reversal:${id}`;
    const existing = await this.prisma.journalEntry.findUnique({ where: { idempotencyKey } });
    if (existing) return this.getEntry(existing.id);

    const lines = await this.prisma.journalLine.findMany({
      where: { entryId: id },
      orderBy: { lineNo: 'asc' },
    });
    const reversal = await this.createEntry(
      {
        entryDate: input?.reversalDate ?? new Date().toISOString().slice(0, 10),
        description: `Reversal of ${original.entryNo}`,
        sourceType: 'REVERSAL',
        sourceId: id,
        idempotencyKey,
        lines: lines.map((line) => ({
          accountId: line.accountId,
          debit: line.credit,
          credit: line.debit,
          partyType: line.partyType,
          partyId: line.partyId,
          costCentreId: line.costCentreId,
          memo: line.memo,
        })),
      },
      context,
      true,
    );

    await this.prisma.journalEntry.update({
      where: { id },
      data: {
        status: 'REVERSED' as const,
        reversalReason: optionalString(input?.reason, 'reason'),
      },
    });
    return this.post(reversal.id, {}, context);
  }

  async postOpening(input: PostingInput, context: RequestContext) {
    const entry = await this.postSystem({ ...input, sourceType: 'OPENING' }, context);
    const lines = await this.prisma.journalLine.findMany({ where: { entryId: entry.id } });
    for (const line of lines) {
      await this.prisma.account.update({
        where: { id: line.accountId },
        data: { openingBalanceEntryId: entry.id },
      });
    }
    return entry;
  }

  async ledger(
    accountId: string,
    filters: { from?: Date; to?: Date; asOf?: Date; partyId?: string },
  ) {
    const account = await this.prisma.account.findUnique({ where: { id: accountId } });
    if (!account) throw new NotFoundError('Account not found.');

    const entries = await this.prisma.journalEntry.findMany({
      where: { status: 'POSTED' as const },
    });
    const entryMap = new Map(entries.map((entry: any) => [entry.id, entry]));
    const lines = await this.prisma.journalLine.findMany({ where: { accountId } });
    const selected = lines
      .filter((line: any) => entryMap.has(line.entryId))
      .filter((line: any) => {
        const entry = entryMap.get(line.entryId);
        const date = new Date(entry.entryDate);
        if (filters.from && date < filters.from) return false;
        if (filters.to && date > filters.to) return false;
        if (filters.asOf && date > filters.asOf) return false;
        if (filters.partyId && line.partyId !== filters.partyId) return false;
        return true;
      })
      .map((line: any) => ({
        ...serializeJournalLine(line),
        entryDate: toDateOnly(entryMap.get(line.entryId).entryDate),
        entryNo: entryMap.get(line.entryId).entryNo,
        journalEntryId: line.entryId,
        drill: `/journal-entries/${line.entryId}`,
      }));

    let running = 0;
    const rows = selected.map((line: any) => {
      const movement = Number(line.debit) - Number(line.credit);
      running = roundMoney(running + movement);
      return { ...line, balance: moneyText(running) };
    });

    return {
      accountId,
      accountCode: account.code,
      accountName: account.name,
      normalBalance: account.normalBalance,
      rows,
      closingBalance: moneyText(running),
    };
  }

  async tAccount(accountId: string, asOf?: Date) {
    const ledger = await this.ledger(accountId, { asOf });
    const debit = ledger.rows.reduce((sum: number, row: any) => sum + Number(row.debit), 0);
    const credit = ledger.rows.reduce((sum: number, row: any) => sum + Number(row.credit), 0);
    return {
      ...ledger,
      debitTotal: moneyText(debit),
      creditTotal: moneyText(credit),
      balance: moneyText(debit - credit),
    };
  }

  async sourceDocument(id: string) {
    const entry = await this.prisma.journalEntry.findUnique({ where: { id } });
    if (!entry) throw new NotFoundError('Journal entry not found.');
    const sourceId = entry.sourceId;
    let source: any = null;

    if (sourceId && entry.sourceType === 'COLLECTION') {
      const bill = await this.prisma.supplierBill.findUnique({ where: { id: sourceId } });
      const adjustment = bill
        ? null
        : await this.prisma.supplierAdjustment.findUnique({ where: { id: sourceId } });
      if (bill) {
        source = {
          type: 'SUPPLIER_BILL',
          id: bill.id,
          supplierId: bill.supplierId,
          netPayable: moneyText(bill.netPayable),
          status: bill.status,
          drill: `/bills/${bill.id}`,
        };
      } else if (adjustment) {
        source = {
          type: 'SUPPLIER_ADJUSTMENT',
          id: adjustment.id,
          supplierId: adjustment.supplierId,
          amount: moneyText(adjustment.amount),
          status: adjustment.status,
          drill: `/adjustments/${adjustment.id}`,
        };
      }
    } else if (sourceId && entry.sourceType === 'PAYROLL') {
      const run = await this.prisma.payrollRun.findUnique({ where: { id: sourceId } });
      const item = run ? null : await this.prisma.payrollItem.findUnique({ where: { id: sourceId } });
      if (run) {
        source = {
          type: 'PAYROLL_RUN',
          id: run.id,
          netTotal: moneyText(run.netTotal),
          status: run.status,
          drill: `/payroll-runs/${run.id}`,
        };
      } else if (item) {
        source = {
          type: 'PAYROLL_ITEM',
          id: item.id,
          personId: item.personId,
          netPay: moneyText(item.netPay),
          drill: `/payroll-items/${item.id}`,
        };
      }
    } else if (sourceId && entry.sourceType === 'SUPPLIER_PAYMENT') {
      const payment = await this.prisma.payment.findUnique({ where: { id: sourceId } });
      if (payment) {
        source = {
          type: 'PAYMENT',
          id: payment.id,
          amount: moneyText(payment.amount),
          status: payment.status,
          reference: payment.reference ?? null,
          drill: `/payments/${payment.id}`,
        };
      }
    } else if (sourceId && entry.sourceType === 'INVENTORY') {
      source = {
        type: 'INVENTORY_EVENT',
        id: sourceId,
        description: entry.description,
        drill: null,
      };
    } else if (sourceId && entry.sourceType === 'YEAR_END') {
      const closing = await this.prisma.yearEndClosing.findUnique({
        where: { fiscalYearId: sourceId },
      });
      if (closing) {
        source = {
          type: 'YEAR_END_CLOSING',
          id: closing.id,
          fiscalYearId: sourceId,
          profitForYear: moneyText(closing.profitForYear),
          drill: null,
        };
      }
    }

    return {
      journalEntryId: id,
      entryNo: entry.entryNo,
      sourceType: entry.sourceType,
      sourceId: sourceId ?? null,
      source,
      drill: source?.drill ?? null,
    };
  }

  async nightlyIntegrity(filters: { asOf?: Date; periodId?: string } = {}) {
    const trial = await this.trialBalance(filters.asOf, filters.periodId);
    const { entries, lines } = await this.postedData(filters.asOf, filters.periodId);
    const entryMap = new Map(entries.map((entry: any) => [entry.id, entry]));
    const snapshots = await this.prisma.accountPeriodBalance.findMany();
    const expected = new Map<string, { debit: number; credit: number }>();
    for (const line of lines) {
      const periodId = entryMap.get(line.entryId)?.periodId ?? '';
      const key = `${periodId}|${line.accountId}|${line.partyId ?? ''}`;
      const totals = expected.get(key) ?? { debit: 0, credit: 0 };
      totals.debit += Number(line.debit ?? 0);
      totals.credit += Number(line.credit ?? 0);
      expected.set(key, totals);
    }

    const mismatches: any[] = [];
    const seen = new Set<string>();
    for (const snapshot of snapshots) {
      const key = `${snapshot.periodId}|${snapshot.accountId}|${snapshot.partyId ?? ''}`;
      seen.add(key);
      const totals = expected.get(key) ?? { debit: 0, credit: 0 };
      const closing = roundMoney(
        Number(snapshot.openingBalance ?? 0) +
          Number(snapshot.periodDebit ?? 0) -
          Number(snapshot.periodCredit ?? 0),
      );
      const issues: string[] = [];
      if (roundMoney(Number(snapshot.periodDebit ?? 0) - totals.debit) !== 0)
        issues.push('periodDebit');
      if (roundMoney(Number(snapshot.periodCredit ?? 0) - totals.credit) !== 0)
        issues.push('periodCredit');
      if (roundMoney(Number(snapshot.closingBalance ?? 0) - closing) !== 0)
        issues.push('closingBalance');
      if (issues.length > 0) {
        mismatches.push({
          accountId: snapshot.accountId,
          periodId: snapshot.periodId,
          partyId: snapshot.partyId ?? null,
          fields: issues,
          expected: {
            periodDebit: moneyText(totals.debit),
            periodCredit: moneyText(totals.credit),
            closingBalance: moneyText(closing),
          },
          actual: {
            periodDebit: moneyText(snapshot.periodDebit),
            periodCredit: moneyText(snapshot.periodCredit),
            closingBalance: moneyText(snapshot.closingBalance),
          },
        });
      }
    }
    for (const [key, totals] of expected.entries()) {
      if (seen.has(key)) continue;
      const [periodId, accountId, partyId] = key.split('|');
      mismatches.push({
        accountId,
        periodId,
        partyId: partyId || null,
        fields: ['missingSnapshot'],
        expected: {
          periodDebit: moneyText(totals.debit),
          periodCredit: moneyText(totals.credit),
        },
        actual: null,
      });
    }

    const ok = trial.balanced && mismatches.length === 0;
    return {
      generatedAt: new Date().toISOString(),
      ok,
      trialBalance: {
        balanced: trial.balanced,
        difference: trial.difference,
        debitTotal: trial.debitTotal,
        creditTotal: trial.creditTotal,
        entries: trial.entries,
      },
      snapshots: {
        balanced: mismatches.length === 0,
        checked: snapshots.length,
        mismatches,
      },
      metrics: {
        accounts_integrity_ok: ok ? 1 : 0,
        accounts_integrity_trial_balance_difference: Number(trial.difference),
        accounts_integrity_snapshot_mismatches: mismatches.length,
      },
    };
  }

  async trialBalance(asOf?: Date, periodId?: string, options: StatementOptions = {}) {
    const { entries, lines } = await this.postedData(asOf, periodId);
    const level = this.reportLevel(options.level);
    const accounts = await this.prisma.account.findMany();
    const accountMap = new Map(accounts.map((account: any) => [account.id, account]));
    const sections = await this.prisma.reportSection.findMany();
    const sectionMap = new Map(sections.map((section: any) => [section.code, section.name]));
    const selected = lines.filter(
      (line: any) => !options.costCentreId || line.costCentreId === options.costCentreId,
    );
    const grouped = new Map<string, any>();

    for (const line of selected) {
      const account = accountMap.get(line.accountId);
      const key =
        level === 'ACCOUNT'
          ? line.accountId
          : level === 'SECTION'
            ? account?.sectionId ?? 'OTHER'
            : account?.accountType ?? 'OTHER';
      const row = grouped.get(key) ?? {
        id: key,
        accountId: level === 'ACCOUNT' ? line.accountId : null,
        code: level === 'ACCOUNT' ? (account?.code ?? '') : key,
        name:
          level === 'ACCOUNT'
            ? (account?.name ?? '')
            : level === 'SECTION'
              ? (sectionMap.get(key) ?? key)
              : key,
        debit: 0,
        credit: 0,
        level: 0,
        drill: level === 'ACCOUNT' ? `/ledger/${line.accountId}` : null,
      };
      row.debit += Number(line.debit ?? 0);
      row.credit += Number(line.credit ?? 0);
      grouped.set(key, row);
    }

    const rows = Array.from(grouped.values())
      .sort((a, b) => String(a.code).localeCompare(String(b.code)))
      .map((row) => ({
        ...row,
        debit: moneyText(row.debit),
        credit: moneyText(row.credit),
      }));
    const debitTotal = rows.reduce((sum, row) => sum + Number(row.debit), 0);
    const creditTotal = rows.reduce((sum, row) => sum + Number(row.credit), 0);
    const difference = roundMoney(debitTotal - creditTotal);
    const result: any = {
      report: 'TRIAL_BALANCE',
      asOf: asOf ? dateKey(asOf) : null,
      periodId: periodId ?? null,
      entries: entries.length,
      level,
      costCentreId: options.costCentreId ?? null,
      columns: ['Debit', 'Credit'],
      rows,
      debitTotal: moneyText(debitTotal),
      creditTotal: moneyText(creditTotal),
      difference: moneyText(difference),
      balanced: difference === 0,
      checks: { balanced: difference === 0, difference: moneyText(difference) },
    };

    if (this.comparison(options.compare) === 'PREVIOUS_YEAR' && asOf) {
      const previous = await this.trialBalance(this.previousYearDate(asOf), periodId);
      result.comparison = { asOf: previous.asOf, debitTotal: previous.debitTotal, creditTotal: previous.creditTotal };
    }
    return result;
  }

  async profitLoss(from?: Date, to?: Date, options: StatementOptions = {}) {
    const current = await this.profitLossCore(from, to, options);
    const comparison = this.comparison(options.compare);
    if (comparison === 'NONE' || (!from && comparison === 'PREVIOUS_PERIOD')) {
      return { ...current, report: 'PROFIT_LOSS', columns: ['This period'] };
    }

    const range = this.comparisonRange(from, to, comparison);
    if (!range) return { ...current, report: 'PROFIT_LOSS', columns: ['This period'] };
    const previous = await this.profitLossCore(range.from, range.to, {
      ...options,
      compare: 'NONE',
    });
    const previousRows = new Map(previous.rows.map((row: any) => [row.id, row]));
    const rows = current.rows.map((row: any) => {
      const previousAmount = Number(previousRows.get(row.id)?.amount ?? 0);
      const amount = Number(row.amount);
      return {
        ...row,
        values: [amount, previousAmount, this.changePercent(amount, previousAmount)],
      };
    });

    return {
      ...current,
      report: 'PROFIT_LOSS',
      columns: ['This period', 'Previous period', 'Change %'],
      rows,
      comparison: {
        mode: comparison,
        from: range.from ? dateKey(range.from) : null,
        to: range.to ? dateKey(range.to) : null,
      },
      previous: {
        income: previous.income,
        expenses: previous.expenses,
        profit: previous.profit,
      },
    };
  }

  private async profitLossCore(from?: Date, to?: Date, options: StatementOptions = {}) {
    const { lines } = await this.postedData(to);
    const level = this.reportLevel(options.level);
    const accounts = await this.prisma.account.findMany({ where: { statement: 'PROFIT_LOSS' } });
    const sections = await this.prisma.reportSection.findMany();
    const sectionMap = new Map(sections.map((section: any) => [section.code, section.name]));
    const entries = await this.prisma.journalEntry.findMany({
      where: { status: 'POSTED' as const },
    });
    const entryMap = new Map(entries.map((entry: any) => [entry.id, entry]));
    const grouped = new Map<string, any>();

    for (const account of accounts) {
      const key =
        level === 'ACCOUNT'
          ? account.id
          : level === 'SECTION'
            ? account.sectionId ?? 'OTHER'
            : account.accountType;
      if (!grouped.has(key)) {
        grouped.set(key, {
          id: key,
          accountId: level === 'ACCOUNT' ? account.id : null,
          code: level === 'ACCOUNT' ? account.code : key,
          name:
            level === 'ACCOUNT'
              ? account.name
              : level === 'SECTION'
                ? (sectionMap.get(key) ?? key)
                : key,
          section: account.sectionId ?? 'OTHER',
          accountType: account.accountType,
          amount: 0,
          level: 0,
          drill: level === 'ACCOUNT' ? `/ledger/${account.id}` : null,
        });
      }
    }

    for (const line of lines) {
      const account = accounts.find((candidate: any) => candidate.id === line.accountId);
      if (!account) continue;
      if (options.costCentreId && line.costCentreId !== options.costCentreId) continue;
      const entry = entryMap.get(line.entryId);
      if (!entry) continue;
      const date = new Date(entry.entryDate);
      if (from && date < from) continue;
      if (to && date > to) continue;
      const key =
        level === 'ACCOUNT'
          ? account.id
          : level === 'SECTION'
            ? account.sectionId ?? 'OTHER'
            : account.accountType;
      const row = grouped.get(key);
      if (!row) continue;
      row.amount += account.accountType === 'INCOME'
        ? Number(line.credit ?? 0) - Number(line.debit ?? 0)
        : Number(line.debit ?? 0) - Number(line.credit ?? 0);
    }

    const rows = Array.from(grouped.values())
      .sort((a, b) => String(a.code).localeCompare(String(b.code)))
      .map((row) => ({ ...row, amount: moneyText(roundMoney(row.amount)) }));
    const income = rows
      .filter((row: any) => row.accountType === 'INCOME')
      .reduce((sum: number, row: any) => sum + Number(row.amount), 0);
    const expenses = rows
      .filter((row: any) => row.accountType === 'EXPENSE')
      .reduce((sum: number, row: any) => sum + Number(row.amount), 0);
    return {
      from: from ? dateKey(from) : null,
      to: to ? dateKey(to) : null,
      level,
      costCentreId: options.costCentreId ?? null,
      rows,
      income: moneyText(roundMoney(income)),
      expenses: moneyText(roundMoney(expenses)),
      profit: moneyText(roundMoney(income - expenses)),
    };
  }

  async balanceSheet(asOf?: Date, options: StatementOptions = {}) {
    const reportDate = asOf ?? new Date();
    const trialBalance = await this.trialBalance(reportDate, options.periodId, options);
    const accounts = await this.prisma.account.findMany();
    const byId = new Map(
      accounts
        .filter(
          (account: any) =>
            account.statement === 'BALANCE_SHEET' ||
            (!account.statement && ['ASSET', 'LIABILITY', 'EQUITY'].includes(account.accountType)),
        )
        .map((account: any) => [account.id, account]),
    );
    let assets = 0;
    let liabilities = 0;
    let equity = 0;
    const rows = trialBalance.rows
      .filter((row: any) => byId.has(row.accountId))
      .map((row: any) => {
        const account = byId.get(row.accountId);
        const balance = Number(row.debit) - Number(row.credit);
        const reported = account.accountType === 'ASSET' ? balance : -balance;
        if (account.accountType === 'ASSET') assets += reported;
        if (account.accountType === 'LIABILITY') liabilities += reported;
        if (account.accountType === 'EQUITY') equity += reported;
        return { ...row, section: account.sectionId ?? 'OTHER', amount: moneyText(reported) };
      });

    const year = await this.fiscalYearForDate(reportDate);
    let currentYearProfit = 0;
    if (year && year.status === 'OPEN') {
      const profitAndLoss = await this.profitLossCore(year.startDate, reportDate, {
        costCentreId: options.costCentreId,
      });
      currentYearProfit = roundMoney(Number(profitAndLoss.profit));
      equity += currentYearProfit;
      rows.push({
        id: 'CURRENT_YEAR_PROFIT',
        accountId: null,
        code: 'CY',
        name: 'Current year profit',
        section: 'EQUITY',
        amount: moneyText(currentYearProfit),
        level: 0,
        drill: null,
      });
    }

    const difference = roundMoney(assets - liabilities - equity);
    return {
      report: 'BALANCE_SHEET',
      asOf: dateKey(reportDate),
      rows,
      assets: moneyText(roundMoney(assets)),
      liabilities: moneyText(roundMoney(liabilities)),
      equity: moneyText(roundMoney(equity)),
      currentYearProfit: moneyText(currentYearProfit),
      difference: moneyText(difference),
      balanced: difference === 0,
      checks: { balanced: difference === 0 },
    };
  }

  async cashFlow(from?: Date, to?: Date, options: StatementOptions = {}) {
    const { lines } = await this.postedData(to);
    const entries = await this.prisma.journalEntry.findMany({
      where: { status: 'POSTED' as const },
    });
    const entryMap = new Map(entries.map((entry: any) => [entry.id, entry]));
    const accounts = await this.prisma.account.findMany({ where: { isCashAccount: true } });
    const grouped = new Map<string, number>();
    for (const line of lines) {
      const account = accounts.find((candidate: any) => candidate.id === line.accountId);
      if (!account) continue;
      if (options.costCentreId && line.costCentreId !== options.costCentreId) continue;
      const entry = entryMap.get(line.entryId);
      if (!entry) continue;
      const date = new Date(entry.entryDate);
      if (from && date < from) continue;
      if (to && date > to) continue;
      const category = account.cashFlowCategory ?? 'OPERATING';
      grouped.set(
        category,
        (grouped.get(category) ?? 0) + Number(line.debit) - Number(line.credit),
      );
    }
    const rows = Array.from(grouped.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([category, amount]) => ({ category, amount: moneyText(roundMoney(amount)) }));
    return {
      report: 'CASH_FLOW',
      from: from ? dateKey(from) : null,
      to: to ? dateKey(to) : null,
      costCentreId: options.costCentreId ?? null,
      rows,
    };
  }

  async equityChanges(from?: Date, to?: Date, options: StatementOptions = {}) {
    const accounts = (
      await this.prisma.account.findMany({ where: { accountType: 'EQUITY' as any } })
    ).sort((left: any, right: any) => left.code.localeCompare(right.code));
    const accountIds = new Set(accounts.map((account: any) => account.id));
    const openingCutoff = from ? new Date(from.getTime() - 86_400_000) : undefined;
    const { lines: openingLines } = await this.postedData(openingCutoff);
    const openingEntries = await this.prisma.journalEntry.findMany({
      where: { status: 'POSTED' as const },
    });
    const openingEntryMap = new Map(openingEntries.map((entry: any) => [entry.id, entry]));
    const opening = new Map<string, number>();
    for (const line of openingLines) {
      if (!accountIds.has(line.accountId)) continue;
      const entry = openingEntryMap.get(line.entryId);
      if (!entry || (openingCutoff && new Date(entry.entryDate) > openingCutoff)) continue;
      opening.set(
        line.accountId,
        (opening.get(line.accountId) ?? 0) + Number(line.credit ?? 0) - Number(line.debit ?? 0),
      );
    }

    const { lines: movementLines } = await this.postedData(to);
    const movementEntries = await this.prisma.journalEntry.findMany({
      where: { status: 'POSTED' as const },
    });
    const movementEntryMap = new Map(movementEntries.map((entry: any) => [entry.id, entry]));
    const movements = new Map<string, number>();
    for (const line of movementLines) {
      if (!accountIds.has(line.accountId)) continue;
      if (options.costCentreId && line.costCentreId !== options.costCentreId) continue;
      const entry = movementEntryMap.get(line.entryId);
      if (!entry) continue;
      const date = new Date(entry.entryDate);
      if (from && date < from) continue;
      if (to && date > to) continue;
      movements.set(
        line.accountId,
        (movements.get(line.accountId) ?? 0) + Number(line.credit ?? 0) - Number(line.debit ?? 0),
      );
    }

    const rows = accounts.map((account: any) => {
      const openingBalance = roundMoney(opening.get(account.id) ?? 0);
      const movement = roundMoney(movements.get(account.id) ?? 0);
      return {
        id: account.id,
        accountId: account.id,
        code: account.code,
        name: account.name,
        section: account.sectionId ?? 'EQUITY',
        opening: moneyText(openingBalance),
        movements: moneyText(movement),
        closing: moneyText(openingBalance + movement),
        level: 0,
        drill: `/ledger/${account.id}`,
      };
    });
    const profitAndLoss = await this.profitLossCore(from, to, {
      costCentreId: options.costCentreId,
    });
    const profitForPeriod = Number(profitAndLoss.profit);
    const openingEquity = roundMoney(rows.reduce((sum: number, row: any) => sum + Number(row.opening), 0));
    const movementTotal = roundMoney(
      rows.reduce((sum: number, row: any) => sum + Number(row.movements), 0),
    );
    const closingEquity = roundMoney(openingEquity + movementTotal + profitForPeriod);

    return {
      report: 'EQUITY_CHANGES',
      from: from ? dateKey(from) : null,
      to: to ? dateKey(to) : null,
      columns: ['Opening', 'Movements', 'Closing'],
      rows,
      openingEquity: moneyText(openingEquity),
      movementTotal: moneyText(movementTotal),
      profitForPeriod: moneyText(profitForPeriod),
      closingEquity: moneyText(closingEquity),
      checks: {
        balanced: roundMoney(closingEquity - openingEquity - movementTotal - profitForPeriod) === 0,
      },
    };
  }

  async budgetVsActual(from?: Date, to?: Date, options: StatementOptions = {}) {
    const profitAndLoss = await this.profitLossCore(from, to, {
      costCentreId: options.costCentreId,
      level: options.level,
    });
    const periods = await this.prisma.fiscalPeriod.findMany();
    const periodIds = new Set(
      periods
        .filter(
          (period: any) =>
            (!from || new Date(period.endDate) >= from) &&
            (!to || new Date(period.startDate) <= to),
        )
        .map((period: any) => period.id),
    );
    let budgets = await this.prisma.budget.findMany();
    if (options.budgetId) {
      budgets = budgets.filter((budget: any) => budget.id === options.budgetId);
    } else if (from || to) {
      budgets = budgets.filter((budget: any) => periodIds.has(budget.fiscalPeriodId));
    }
    if (options.budgetId && budgets.length === 0) throw new NotFoundError('Budget not found.');

    const rows = budgets.map((budget: any) => {
      const matching = profitAndLoss.rows.filter(
        (row: any) =>
          budget.name === 'TOTAL' ||
          row.code === budget.name ||
          row.id === budget.name ||
          row.section === budget.name,
      );
      const budgetAmount = Number(budget.totalAmount ?? 0);
      const actual = roundMoney(
        matching.reduce(
          (sum: number, row: any) =>
            sum +
            (budget.name === 'TOTAL' ? Number(profitAndLoss.profit) : Number(row.amount)),
          0,
        ),
      );
      const variance = roundMoney(budgetAmount - actual);
      return {
        id: budget.id,
        budgetId: budget.id,
        name: budget.name,
        budget: moneyText(budgetAmount),
        actual: moneyText(actual),
        variance: moneyText(variance),
        variancePercent: budgetAmount === 0 ? null : roundMoney((variance / budgetAmount) * 100),
        drill:
          matching.length === 1 && matching[0].drill
            ? matching[0].drill
            : null,
      };
    });
    const budgetTotal = roundMoney(rows.reduce((sum: number, row: any) => sum + Number(row.budget), 0));
    const actualTotal = roundMoney(rows.reduce((sum: number, row: any) => sum + Number(row.actual), 0));
    return {
      report: 'BUDGET_VS_ACTUAL',
      from: from ? dateKey(from) : null,
      to: to ? dateKey(to) : null,
      budgetId: options.budgetId ?? null,
      columns: ['Budget', 'Actual', 'Variance', 'Variance %'],
      rows,
      budgetTotal: moneyText(budgetTotal),
      actualTotal: moneyText(actualTotal),
      varianceTotal: moneyText(roundMoney(budgetTotal - actualTotal)),
    };
  }

  async closeFiscalYear(input: any, context: RequestContext) {
    const fiscalYearId = uuid(input?.fiscalYearId, 'fiscalYearId');
    const year = await this.prisma.fiscalYear.findUnique({ where: { id: fiscalYearId } });
    if (!year) throw new NotFoundError('Fiscal year not found.');
    if (year.status === 'CLOSED') throw new ConflictError('Fiscal year is already closed.');

    const closingDate = input?.closingDate
      ? dateOnly(input.closingDate, 'closingDate')
      : new Date(year.endDate);
    if (closingDate < new Date(year.startDate) || closingDate > new Date(year.endDate)) {
      throw new BusinessRuleError('closingDate must fall inside the fiscal year.');
    }
    const existing = await this.prisma.yearEndClosing.findUnique({ where: { fiscalYearId } });
    if (existing) throw new ConflictError('Fiscal year has already been closed.');

    const periods = await this.prisma.fiscalPeriod.findMany({ where: { fiscalYearId } });
    const openPeriod = periods.find((period: any) => period.status === 'OPEN');
    if (!openPeriod) {
      throw new BusinessRuleError('An open fiscal period is required for the closing entry.');
    }
    const trial = await this.trialBalance(closingDate);
    if (!trial.balanced) {
      throw new BusinessRuleError('Trial balance must be zero before year-end close.');
    }
    const profitAndLoss = await this.profitLossCore(new Date(year.startDate), closingDate);
    const retained = await this.accounts.accountByCode('3010');
    const lines: any[] = [];
    for (const row of profitAndLoss.rows) {
      const amount = roundMoney(Number(row.amount));
      if (amount === 0) continue;
      if (row.accountType === 'INCOME') {
        lines.push({ accountId: row.accountId, debit: moneyText(amount), credit: '0.00' });
      } else if (row.accountType === 'EXPENSE') {
        lines.push({ accountId: row.accountId, debit: '0.00', credit: moneyText(amount) });
      }
    }
    const profit = roundMoney(Number(profitAndLoss.profit));
    if (lines.length === 0 && profit === 0) {
      throw new BusinessRuleError('There is no profit or loss activity to close.');
    }
    if (profit !== 0) {
      lines.push(
        profit > 0
          ? { accountId: retained.id, debit: '0.00', credit: moneyText(profit) }
          : { accountId: retained.id, debit: moneyText(-profit), credit: '0.00' },
      );
    }

    const idempotencyKey = `year-end-close:${fiscalYearId}`;
    const entry = await this.postSystemWithContext(
      {
        entryDate: dateKey(closingDate),
        description: `Year-end close ${year.name}`,
        sourceType: 'YEAR_END',
        sourceId: fiscalYearId,
        idempotencyKey,
        lines,
      },
      context,
      openPeriod.id,
    );

    await this.prisma.yearEndClosing.create({
      data: {
        fiscalYearId,
        journalEntryId: entry.id,
        profitForYear: moneyText(profit),
        createdBy: context.actorId ?? 'system',
      },
    });
    await this.prisma.fiscalYear.update({
      where: { id: fiscalYearId },
      data: { status: 'CLOSED' as any },
    });
    await this.prisma.fiscalPeriod.updateMany({
      where: { fiscalYearId },
      data: { status: 'LOCKED' as any, closedAt: new Date(), closedBy: context.actorId ?? null },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'fiscalYear.closed',
      entityType: 'FiscalYear',
      entityId: fiscalYearId,
      metadata: { journalEntryId: entry.id, profit: moneyText(profit) },
    });
    return {
      fiscalYearId,
      status: 'CLOSED',
      journalEntryId: entry.id,
      profitForYear: moneyText(profit),
    };
  }

  private comparison(value?: string): (typeof COMPARISONS)[number] {
    const normalized = String(value ?? 'NONE')
      .toUpperCase()
      .replace(/-/g, '_') as (typeof COMPARISONS)[number];
    return COMPARISONS.includes(normalized) ? normalized : 'NONE';
  }

  private reportLevel(value?: string): (typeof LEVELS)[number] {
    const normalized = String(value ?? 'ACCOUNT').toUpperCase() as (typeof LEVELS)[number];
    return LEVELS.includes(normalized) ? normalized : 'ACCOUNT';
  }

  private comparisonRange(from?: Date, to?: Date, mode = 'NONE') {
    if (mode === 'PREVIOUS_YEAR' && (from || to)) {
      return {
        from: from ? this.previousYearDate(from) : undefined,
        to: to ? this.previousYearDate(to) : undefined,
      };
    }
    if (mode === 'PREVIOUS_PERIOD' && from && to && to >= from) {
      const span = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
      const previousTo = new Date(from.getTime() - 86_400_000);
      const previousFrom = new Date(previousTo.getTime() - (span - 1) * 86_400_000);
      return { from: previousFrom, to: previousTo };
    }
    return null;
  }

  private previousYearDate(date: Date) {
    const previous = new Date(date.getTime());
    previous.setUTCFullYear(previous.getUTCFullYear() - 1);
    return previous;
  }

  private changePercent(current: number, previous: number): number | null {
    if (previous === 0) return current === 0 ? 0 : null;
    return roundMoney(((current - previous) / Math.abs(previous)) * 100);
  }

  private async fiscalYearForDate(date: Date) {
    const rows = await this.prisma.fiscalYear.findMany();
    return (
      rows.find(
        (year: any) =>
          new Date(year.startDate) <= date && new Date(year.endDate) >= date,
      ) ?? null
    );
  }

  private async createEntry(
    input: PostingInput,
    context: RequestContext,
    system: boolean,
    periodId?: string,
  ) {
    const entryDate = dateOnly(input?.entryDate, 'entryDate');
    const description = requiredString(input?.description, 'description');
    const sourceType = input?.sourceType
      ? this.oneOfSource(input.sourceType)
      : system
        ? 'INVENTORY'
        : 'MANUAL';
    const sourceId = optionalUuid(input?.sourceId, 'sourceId');
    const idempotencyKey = requiredString(input?.idempotencyKey, 'idempotencyKey');

    const existing = await this.prisma.journalEntry.findUnique({ where: { idempotencyKey } });
    if (existing) return existing;

    const period = periodId
      ? await this.accounts.assertPeriodOpen(periodId)
      : await this.accounts.periodForDate(entryDate);
    await this.accounts.assertPeriodOpen(period.id);

    const lines = await this.normalizeLines(
      requiredArray(input?.lines, 'lines'),
      sourceType === 'MANUAL',
    );
    this.assertBalanced(lines);

    const entryNo = `JV-${dateKey(entryDate).replace(/-/g, '')}-${uuidv7().slice(0, 8).toUpperCase()}`;
    return this.prisma.$transaction(async (tx: any) => {
      const entry = await tx.journalEntry.create({
        data: {
          entryNo,
          entryDate,
          periodId: period.id,
          description,
          sourceType,
          sourceId,
          status: 'DRAFT' as const,
          idempotencyKey,
          currency: 'LKR',
        },
      });
      for (const [index, line] of lines.entries()) {
        await tx.journalLine.create({
          data: {
            entryId: entry.id,
            accountId: line.accountId,
            debit: line.debit,
            credit: line.credit,
            partyType: line.partyType,
            partyId: line.partyId,
            costCentreId: line.costCentreId,
            memo: line.memo,
            lineNo: index + 1,
          },
        });
      }
      await this.audit.record(
        {
          actorId: context.actorId,
          action: system ? 'journal.system_drafted' : 'journal.drafted',
          entityType: 'JournalEntry',
          entityId: entry.id,
          metadata: { entryNo },
        },
        tx,
      );
      return entry;
    });
  }

  private async normalizeLines(rawLines: unknown[], manual: boolean): Promise<NormalizedLine[]> {
    const lines: NormalizedLine[] = [];
    for (const raw of rawLines) {
      const input = raw as JournalLineInput;
      const accountId = uuid(input?.accountId, 'line.accountId');
      const account = await this.prisma.account.findUnique({ where: { id: accountId } });
      if (!account) throw new NotFoundError('Line account not found.');
      if (!account.active || !account.isPostable) {
        throw new BusinessRuleError(`Account ${account.code} cannot be posted to.`);
      }
      if (manual && !account.allowManualPosting) {
        throw new BusinessRuleError(`Account ${account.code} does not allow manual postings.`);
      }

      const debit = money(input?.debit ?? '0.00', 'line.debit');
      const credit = money(input?.credit ?? '0.00', 'line.credit');
      if ((debit === '0.00') === (credit === '0.00')) {
        throw new BusinessRuleError('Each journal line must have either debit or credit.');
      }
      if (account.isControl && !input?.partyId) {
        throw new BusinessRuleError(`Control account ${account.code} requires a party.`);
      }

      lines.push({
        accountId,
        debit,
        credit,
        partyType: optionalString(input?.partyType, 'line.partyType'),
        partyId: optionalUuid(input?.partyId, 'line.partyId'),
        costCentreId: optionalUuid(input?.costCentreId, 'line.costCentreId'),
        memo: optionalString(input?.memo, 'line.memo'),
      });
    }
    return lines;
  }

  private assertBalanced(lines: Array<{ debit: unknown; credit: unknown }>) {
    const debit = lines.reduce((sum, line) => sum + Number(line.debit ?? 0), 0);
    const credit = lines.reduce((sum, line) => sum + Number(line.credit ?? 0), 0);
    if (roundMoney(debit - credit) !== 0) {
      throw new BusinessRuleError('Journal entry debits must equal credits.');
    }
  }

  private async updatePeriodBalances(tx: any, periodId: string, lines: any[]) {
    for (const line of lines) {
      const where = {
        accountId: line.accountId,
        periodId,
        partyId: line.partyId ?? null,
      };
      const existing = await tx.accountPeriodBalance.findFirst({ where });
      const debit = Number(line.debit ?? 0);
      const credit = Number(line.credit ?? 0);
      if (existing) {
        const periodDebit = roundMoney(Number(existing.periodDebit ?? 0) + debit);
        const periodCredit = roundMoney(Number(existing.periodCredit ?? 0) + credit);
        await tx.accountPeriodBalance.update({
          where: { id: existing.id },
          data: {
            periodDebit: moneyText(periodDebit),
            periodCredit: moneyText(periodCredit),
            closingBalance: moneyText(
              Number(existing.openingBalance ?? 0) + periodDebit - periodCredit,
            ),
          },
        });
      } else {
        await tx.accountPeriodBalance.create({
          data: {
            ...where,
            openingBalance: '0.00',
            periodDebit: moneyText(debit),
            periodCredit: moneyText(credit),
            closingBalance: moneyText(debit - credit),
          },
        });
      }
    }
  }

  private async postedData(asOf?: Date, periodId?: string) {
    const entries = await this.prisma.journalEntry.findMany({
      where: { status: 'POSTED' as const },
    });
    const selected = entries.filter((entry: any) => {
      if (periodId && entry.periodId !== periodId) return false;
      if (asOf && new Date(entry.entryDate) > asOf) return false;
      return true;
    });
    const ids = new Set(selected.map((entry: any) => entry.id));
    const lines = (await this.prisma.journalLine.findMany()).filter((line: any) =>
      ids.has(line.entryId),
    );
    return { entries: selected, lines };
  }

  private oneOfSource(value: unknown): string {
    const text = requiredString(value, 'sourceType');
    if (!SOURCE_TYPES.includes(text as any)) {
      throw new BusinessRuleError(`Unsupported sourceType ${text}.`);
    }
    return text;
  }
}

export const JOURNAL_SOURCE_TYPES = SOURCE_TYPES;
