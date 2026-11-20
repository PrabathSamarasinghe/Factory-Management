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
] as const;

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

  async trialBalance(asOf?: Date, periodId?: string) {
    const { entries, lines } = await this.postedData(asOf, periodId);
    const accountIds = new Set(lines.map((line: any) => line.accountId));
    const accounts = await this.prisma.account.findMany();
    const accountMap = new Map(accounts.map((account: any) => [account.id, account]));
    const grouped = new Map<
      string,
      { accountId: string; code: string; name: string; debit: number; credit: number }
    >();

    for (const accountId of accountIds) {
      const account = accountMap.get(accountId);
      grouped.set(accountId, {
        accountId,
        code: account?.code ?? '',
        name: account?.name ?? '',
        debit: 0,
        credit: 0,
      });
    }
    for (const line of lines) {
      const row = grouped.get(line.accountId);
      if (!row) continue;
      row.debit += Number(line.debit ?? 0);
      row.credit += Number(line.credit ?? 0);
    }

    const rows = Array.from(grouped.values())
      .sort((a, b) => a.code.localeCompare(b.code))
      .map((row) => ({
        ...row,
        debit: moneyText(row.debit),
        credit: moneyText(row.credit),
      }));
    const debitTotal = rows.reduce((sum, row) => sum + Number(row.debit), 0);
    const creditTotal = rows.reduce((sum, row) => sum + Number(row.credit), 0);
    const difference = roundMoney(debitTotal - creditTotal);

    return {
      asOf: asOf ? dateKey(asOf) : null,
      periodId: periodId ?? null,
      entries: entries.length,
      rows,
      debitTotal: moneyText(debitTotal),
      creditTotal: moneyText(creditTotal),
      difference: moneyText(difference),
      balanced: difference === 0,
    };
  }

  async profitLoss(from?: Date, to?: Date) {
    const { lines } = await this.postedData(to);
    const entries = await this.prisma.journalEntry.findMany({
      where: { status: 'POSTED' as const },
    });
    const entryMap = new Map(entries.map((entry: any) => [entry.id, entry]));
    const accounts = await this.prisma.account.findMany({ where: { statement: 'PROFIT_LOSS' } });
    const accountMap = new Map(accounts.map((account: any) => [account.id, account]));

    const rows = accounts
      .map((account: any) => {
        const relevant = lines.filter(
          (line: any) =>
            line.accountId === account.id &&
            (!from || new Date(entryMap.get(line.entryId).entryDate) >= from) &&
            (!to || new Date(entryMap.get(line.entryId).entryDate) <= to),
        );
        const debit = relevant.reduce((sum: number, line: any) => sum + Number(line.debit), 0);
        const credit = relevant.reduce((sum: number, line: any) => sum + Number(line.credit), 0);
        return {
          accountId: account.id,
          code: account.code,
          name: account.name,
          section: account.sectionId ?? 'OTHER',
          amount: moneyText(account.accountType === 'INCOME' ? credit - debit : debit - credit),
        };
      })
      .sort((a: any, b: any) => a.code.localeCompare(b.code));

    const income = rows
      .filter((row: any) => accountMap.get(row.accountId)?.accountType === 'INCOME')
      .reduce((sum: number, row: any) => sum + Number(row.amount), 0);
    const expenses = rows
      .filter((row: any) => accountMap.get(row.accountId)?.accountType === 'EXPENSE')
      .reduce((sum: number, row: any) => sum + Number(row.amount), 0);

    return {
      from: from ? dateKey(from) : null,
      to: to ? dateKey(to) : null,
      rows,
      income: moneyText(income),
      expenses: moneyText(expenses),
      profit: moneyText(income - expenses),
    };
  }

  async balanceSheet(asOf?: Date) {
    const trialBalance = await this.trialBalance(asOf);
    const accounts = await this.prisma.account.findMany({ where: { statement: 'BALANCE_SHEET' } });
    const byId = new Map(accounts.map((account: any) => [account.id, account]));
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

    return {
      asOf: asOf ? dateKey(asOf) : null,
      rows,
      assets: moneyText(assets),
      liabilities: moneyText(liabilities),
      equity: moneyText(equity),
      difference: moneyText(assets - liabilities - equity),
      balanced: Math.round((assets - liabilities - equity) * 100) === 0,
    };
  }

  async cashFlow(from?: Date, to?: Date) {
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
      .map(([category, amount]) => ({ category, amount: moneyText(amount) }));
    return { from: from ? dateKey(from) : null, to: to ? dateKey(to) : null, rows };
  }

  private async createEntry(input: PostingInput, context: RequestContext, system: boolean) {
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

    const period = await this.accounts.periodForDate(entryDate);
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
