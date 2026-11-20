import { Injectable } from '@nestjs/common';
import { BusinessRuleError, ConflictError, NotFoundError } from '@galatura/platform-kit';
import { AuditService } from '../audit/audit.service';
import { OutboxService } from '../outbox/outbox.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  booleanValue,
  dateKey,
  dateOnly,
  money,
  oneOf,
  optionalPositiveInt,
  optionalString,
  optionalUuid,
  positiveInt,
  requiredArray,
  requiredString,
  uuid,
} from '../common/validation';
import { serializeAccount } from '../common/serialize';
import type { RequestContext } from '../common/request';

const ACCOUNT_TYPES = ['ASSET', 'LIABILITY', 'EQUITY', 'INCOME', 'EXPENSE'] as const;
const NORMAL_BALANCES = ['DEBIT', 'CREDIT'] as const;
const STATEMENTS = ['BALANCE_SHEET', 'PROFIT_LOSS', 'CASH_FLOW', 'EQUITY'] as const;

@Injectable()
export class AccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
  ) {}

  async listAccounts() {
    const rows = await this.prisma.account.findMany({ orderBy: { code: 'asc' } });
    const children = new Map<string | null, any[]>();
    for (const row of rows) {
      const key = row.parentId ?? null;
      children.set(key, [...(children.get(key) ?? []), row]);
    }
    const build = (parentId: string | null): any[] =>
      (children.get(parentId) ?? [])
        .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code))
        .map((row) => ({ ...serializeAccount(row), children: build(row.id) }));
    return build(null);
  }

  async listFlatAccounts() {
    const rows = await this.prisma.account.findMany({ orderBy: { code: 'asc' } });
    return rows.map(serializeAccount);
  }

  async getAccount(id: string) {
    const row = await this.prisma.account.findUnique({ where: { id } });
    if (!row) throw new NotFoundError('Account not found.');
    return serializeAccount(row);
  }

  async accountByCode(code: string) {
    const row = await this.prisma.account.findUnique({ where: { code } });
    if (!row) throw new NotFoundError(`Account ${code} not found.`);
    return row;
  }

  async createAccount(input: any, context: RequestContext) {
    const code = requiredString(input?.code, 'code');
    const name = requiredString(input?.name, 'name');
    const accountType = oneOf(input?.accountType, ACCOUNT_TYPES, 'accountType');
    const normalBalance = oneOf(input?.normalBalance, NORMAL_BALANCES, 'normalBalance');
    const parentId = optionalUuid(input?.parentId, 'parentId');
    const existing = await this.prisma.account.findUnique({ where: { code } });
    if (existing) throw new ConflictError('Account code already exists.');

    if (parentId) {
      const parent = await this.prisma.account.findUnique({ where: { id: parentId } });
      if (!parent) throw new NotFoundError('Parent account not found.');
      if (parent.accountType !== accountType) {
        throw new BusinessRuleError('Parent account must have the same account type.');
      }
    }

    const row = await this.prisma.account.create({
      data: {
        code,
        name,
        accountType: accountType as any,
        normalBalance: normalBalance as any,
        parentId,
        isPostable:
          input?.isPostable === undefined ? true : booleanValue(input.isPostable, 'isPostable'),
        isControl:
          input?.isControl === undefined ? false : booleanValue(input.isControl, 'isControl'),
        partyType: optionalString(input?.partyType, 'partyType'),
        active: true,
        statement: input?.statement ? oneOf(input.statement, STATEMENTS, 'statement') : null,
        sectionId: optionalString(input?.sectionId, 'sectionId'),
        sortOrder: optionalPositiveInt(input?.sortOrder, 'sortOrder') ?? 0,
        cashFlowCategory: optionalString(input?.cashFlowCategory, 'cashFlowCategory'),
        isCashAccount:
          input?.isCashAccount === undefined
            ? false
            : booleanValue(input.isCashAccount, 'isCashAccount'),
        allowManualPosting:
          input?.allowManualPosting === undefined
            ? true
            : booleanValue(input.allowManualPosting, 'allowManualPosting'),
      },
    });

    await this.audit.record({
      actorId: context.actorId,
      action: 'account.created',
      entityType: 'Account',
      entityId: row.id,
      metadata: { code, accountType },
    });
    await this.outbox.append(
      'account.created',
      { accountId: row.id, code: row.code, name: row.name, accountType: row.accountType },
      { type: 'USER', id: context.actorId ?? 'system' },
    );
    return serializeAccount(row);
  }

  async updateAccount(id: string, input: any, context: RequestContext) {
    const row = await this.prisma.account.findUnique({ where: { id } });
    if (!row) throw new NotFoundError('Account not found.');
    if (
      input?.accountType &&
      oneOf(input.accountType, ACCOUNT_TYPES, 'accountType') !== row.accountType
    ) {
      throw new BusinessRuleError('Account type cannot be changed.');
    }

    const parentId = optionalUuid(input?.parentId, 'parentId');
    if (parentId) {
      const parent = await this.prisma.account.findUnique({ where: { id: parentId } });
      if (!parent || parent.id === id) throw new BusinessRuleError('Invalid parent account.');
      if (parent.accountType !== row.accountType) {
        throw new BusinessRuleError('Parent account must have the same account type.');
      }
    }

    const updated = await this.prisma.account.update({
      where: { id },
      data: {
        name: input?.name === undefined ? undefined : requiredString(input.name, 'name'),
        parentId: input?.parentId === undefined ? undefined : parentId,
        statement:
          input?.statement === undefined
            ? undefined
            : input.statement === null
              ? null
              : oneOf(input.statement, STATEMENTS, 'statement'),
        sectionId:
          input?.sectionId === undefined ? undefined : optionalString(input.sectionId, 'sectionId'),
        sortOrder:
          input?.sortOrder === undefined ? undefined : positiveInt(input.sortOrder, 'sortOrder'),
        active: input?.deactivated === true ? false : undefined,
        deactivatedAt: input?.deactivated === true ? new Date() : undefined,
      },
    });

    await this.audit.record({
      actorId: context.actorId,
      action: input?.deactivated === true ? 'account.deactivated' : 'account.updated',
      entityType: 'Account',
      entityId: id,
    });
    return serializeAccount(updated);
  }

  async deactivateAccount(id: string, context: RequestContext) {
    return this.updateAccount(id, { deactivated: true }, context);
  }

  async createFiscalYear(input: any, context: RequestContext) {
    const name = requiredString(input?.name, 'name');
    const startDate = dateOnly(input?.startDate, 'startDate');
    const endDate = dateOnly(input?.endDate, 'endDate');
    if (endDate <= startDate) throw new BusinessRuleError('endDate must be after startDate.');

    const row = await this.prisma.fiscalYear.create({
      data: { name, startDate, endDate, status: 'OPEN' },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'fiscalYear.created',
      entityType: 'FiscalYear',
      entityId: row.id,
    });
    return this.serializeFiscalYear(row);
  }

  async listFiscalYears() {
    const rows = await this.prisma.fiscalYear.findMany({ orderBy: { startDate: 'desc' } });
    return rows.map((row) => this.serializeFiscalYear(row));
  }

  async createFiscalPeriod(input: any, context: RequestContext) {
    const fiscalYearId = uuid(input?.fiscalYearId, 'fiscalYearId');
    const name = requiredString(input?.name, 'name');
    const startDate = dateOnly(input?.startDate, 'startDate');
    const endDate = dateOnly(input?.endDate, 'endDate');
    if (endDate <= startDate) throw new BusinessRuleError('endDate must be after startDate.');

    const year = await this.prisma.fiscalYear.findUnique({ where: { id: fiscalYearId } });
    if (!year) throw new NotFoundError('Fiscal year not found.');
    if (startDate < year.startDate || endDate > year.endDate) {
      throw new BusinessRuleError('Fiscal period must fall inside its fiscal year.');
    }

    const existing = await this.prisma.fiscalPeriod.findMany({ where: { fiscalYearId } });
    if (
      existing.some((period: any) => startDate <= period.endDate && endDate >= period.startDate)
    ) {
      throw new ConflictError('Fiscal periods cannot overlap.');
    }

    const row = await this.prisma.fiscalPeriod.create({
      data: { fiscalYearId, name, startDate, endDate, status: 'OPEN' },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'fiscalPeriod.created',
      entityType: 'FiscalPeriod',
      entityId: row.id,
    });
    return this.serializeFiscalPeriod(row);
  }

  async listFiscalPeriods() {
    const rows = await this.prisma.fiscalPeriod.findMany({ orderBy: { startDate: 'desc' } });
    return rows.map((row) => this.serializeFiscalPeriod(row));
  }

  async periodForDate(date: Date) {
    const day = new Date(`${dateKey(date)}T00:00:00.000Z`);
    const rows = await this.prisma.fiscalPeriod.findMany();
    const row = rows.find(
      (period: any) => day >= new Date(period.startDate) && day <= new Date(period.endDate),
    );
    if (!row) throw new ConflictError('No fiscal period covers this date.');
    return row;
  }

  async assertPeriodOpen(periodId: string) {
    const period = await this.prisma.fiscalPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundError('Fiscal period not found.');
    if (period.status !== 'OPEN') throw new ConflictError('Fiscal period is locked.');
    return period;
  }

  async lockPeriod(id: string, input: any, context: RequestContext) {
    const mode = input?.mode ? oneOf(input.mode, ['SOFT_LOCK', 'LOCKED'], 'mode') : 'LOCKED';
    const period = await this.prisma.fiscalPeriod.findUnique({ where: { id } });
    if (!period) throw new NotFoundError('Fiscal period not found.');
    if (period.status === 'LOCKED' && mode === 'SOFT_LOCK') {
      throw new BusinessRuleError('A locked period cannot be soft-locked.');
    }

    const updated = await this.prisma.fiscalPeriod.update({
      where: { id },
      data: {
        status: mode as any,
        closedAt: mode === 'LOCKED' ? new Date() : null,
        closedBy: mode === 'LOCKED' ? context.actorId : null,
      },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'period.locked',
      entityType: 'FiscalPeriod',
      entityId: id,
      metadata: { mode },
    });
    return this.serializeFiscalPeriod(updated);
  }

  async closePeriod(id: string, context: RequestContext) {
    return this.lockPeriod(id, { mode: 'LOCKED' }, context);
  }

  async createPostingRule(input: any, context: RequestContext) {
    const eventType = requiredString(input?.eventType, 'eventType');
    const version = positiveInt(input?.version ?? 1, 'version');
    const effectiveFrom = dateOnly(input?.effectiveFrom, 'effectiveFrom');
    const debitAccountId = uuid(input?.debitAccountId, 'debitAccountId');
    const creditAccountId = uuid(input?.creditAccountId, 'creditAccountId');
    if (debitAccountId === creditAccountId) {
      throw new BusinessRuleError('Debit and credit accounts must differ.');
    }

    const existing = await this.prisma.postingRule.findUnique({
      where: { eventType_version_effectiveFrom: { eventType, version, effectiveFrom } },
    });
    if (existing) throw new ConflictError('Posting rule version already exists.');

    const row = await this.prisma.postingRule.create({
      data: {
        eventType,
        version,
        effectiveFrom,
        debitAccountId,
        creditAccountId,
        conditionJson: input?.conditionJson ?? null,
        approver: context.actorId,
      },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'postingRule.created',
      entityType: 'PostingRule',
      entityId: row.id,
    });
    return this.serializePostingRule(row);
  }

  async listPostingRules(eventType?: string) {
    const rows = await this.prisma.postingRule.findMany(
      eventType
        ? { where: { eventType }, orderBy: [{ eventType: 'asc' }, { version: 'desc' }] }
        : undefined,
    );
    return rows.map((row) => this.serializePostingRule(row));
  }

  async upsertReportSection(code: string, input: any, context: RequestContext) {
    const sectionCode = requiredString(code, 'code');
    const existing = await this.prisma.reportSection.findUnique({ where: { code: sectionCode } });
    const data = {
      code: sectionCode,
      statement: existing?.statement ?? oneOf(input?.statement, STATEMENTS, 'statement'),
      name:
        input?.name === undefined
          ? (existing?.name ?? sectionCode)
          : requiredString(input.name, 'name'),
      parentCode:
        input?.parentCode === undefined
          ? (existing?.parentCode ?? null)
          : optionalString(input.parentCode, 'parentCode'),
      sortOrder:
        input?.sortOrder === undefined
          ? (existing?.sortOrder ?? 0)
          : positiveInt(input.sortOrder, 'sortOrder'),
      sign: input?.sign === undefined ? (existing?.sign ?? 1) : Number(input.sign) < 0 ? -1 : 1,
      isSubtotal:
        input?.isSubtotal === undefined
          ? (existing?.isSubtotal ?? false)
          : booleanValue(input.isSubtotal, 'isSubtotal'),
      formula:
        input?.formula === undefined
          ? (existing?.formula ?? null)
          : optionalString(input.formula, 'formula'),
    };
    const row = existing
      ? await this.prisma.reportSection.update({ where: { code: sectionCode }, data })
      : await this.prisma.reportSection.create({ data });
    await this.audit.record({
      actorId: context.actorId,
      action: existing ? 'reportSection.updated' : 'reportSection.created',
      entityType: 'ReportSection',
      entityId: row.id,
    });
    return this.serializeReportSection(row);
  }

  async listReportSections(statement?: string) {
    const rows = await this.prisma.reportSection.findMany(
      (statement
        ? { where: { statement }, orderBy: { sortOrder: 'asc' } }
        : { orderBy: { sortOrder: 'asc' } }) as any,
    );
    return rows.map((row) => this.serializeReportSection(row));
  }

  async upsertParty(input: any, context: RequestContext) {
    const partyType = requiredString(input?.partyType, 'partyType');
    const externalId = uuid(input?.externalId, 'externalId');
    const displayName = requiredString(input?.displayName, 'displayName');
    const existing = await this.prisma.party.findUnique({
      where: { partyType_externalId: { partyType, externalId } },
    });
    const row = existing
      ? await this.prisma.party.update({
          where: { id: existing.id },
          data: { displayName, code: optionalString(input?.code, 'code') },
        })
      : await this.prisma.party.create({
          data: { partyType, externalId, displayName, code: optionalString(input?.code, 'code') },
        });
    await this.audit.record({
      actorId: context.actorId,
      action: existing ? 'party.updated' : 'party.created',
      entityType: 'Party',
      entityId: row.id,
    });
    return this.serializeParty(row);
  }

  async listParties(partyType?: string) {
    const rows = await this.prisma.party.findMany(
      partyType ? { where: { partyType }, orderBy: { displayName: 'asc' } } : undefined,
    );
    return rows.map((row) => this.serializeParty(row));
  }

  async createBudget(input: any, context: RequestContext) {
    const name = requiredString(input?.name, 'name');
    const fiscalPeriodId = uuid(input?.fiscalPeriodId, 'fiscalPeriodId');
    const totalAmount = money(input?.totalAmount, 'totalAmount');
    const row = await this.prisma.budget.create({
      data: { name, fiscalPeriodId, totalAmount },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'budget.created',
      entityType: 'Budget',
      entityId: row.id,
    });
    return this.serializeBudget(row);
  }

  async listBudgets() {
    const rows = await this.prisma.budget.findMany({ orderBy: { createdAt: 'desc' } });
    return rows.map((row) => this.serializeBudget(row));
  }

  async integrityCheck() {
    const lines = await this.prisma.journalLine.findMany({ where: { debit: { gt: 0 } } });
    const entries = await this.prisma.journalEntry.findMany();
    const byEntry = new Map<string, number>();
    for (const line of lines) {
      byEntry.set(
        line.entryId,
        (byEntry.get(line.entryId) ?? 0) + Number(line.debit ?? 0) - Number(line.credit ?? 0),
      );
    }
    const unbalanced = entries.filter((entry: any) => Math.abs(byEntry.get(entry.id) ?? 0) > 0.005);
    return {
      balanced: unbalanced.length === 0,
      journalEntries: entries.length,
      unbalancedEntries: unbalanced.map((entry: any) => entry.id),
    };
  }

  private serializeFiscalYear(row: any) {
    return {
      id: row.id,
      name: row.name,
      startDate: dateKey(row.startDate),
      endDate: dateKey(row.endDate),
      status: row.status,
    };
  }

  private serializeFiscalPeriod(row: any) {
    return {
      id: row.id,
      fiscalYearId: row.fiscalYearId,
      name: row.name,
      startDate: dateKey(row.startDate),
      endDate: dateKey(row.endDate),
      status: row.status,
      closedAt: row.closedAt ? new Date(row.closedAt).toISOString() : null,
      closedBy: row.closedBy ?? null,
    };
  }

  private serializePostingRule(row: any) {
    return {
      id: row.id,
      eventType: row.eventType,
      version: row.version,
      effectiveFrom: dateKey(row.effectiveFrom),
      debitAccountId: row.debitAccountId,
      creditAccountId: row.creditAccountId,
      conditionJson: row.conditionJson ?? null,
      status: row.status,
      approver: row.approver ?? null,
    };
  }

  private serializeReportSection(row: any) {
    return {
      id: row.id,
      code: row.code,
      statement: row.statement,
      name: row.name,
      parentCode: row.parentCode ?? null,
      sortOrder: row.sortOrder,
      sign: row.sign,
      isSubtotal: row.isSubtotal,
      formula: row.formula ?? null,
    };
  }

  private serializeParty(row: any) {
    return {
      id: row.id,
      partyType: row.partyType,
      externalId: row.externalId,
      displayName: row.displayName,
      code: row.code ?? null,
    };
  }

  private serializeBudget(row: any) {
    return {
      id: row.id,
      name: row.name,
      fiscalPeriodId: row.fiscalPeriodId,
      totalAmount: Number(row.totalAmount ?? 0).toFixed(2),
    };
  }
}

export const ACCOUNT_TYPE_VALUES = ACCOUNT_TYPES;
export const STATEMENT_VALUES = STATEMENTS;
