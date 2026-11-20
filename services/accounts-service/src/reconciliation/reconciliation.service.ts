import { Injectable } from '@nestjs/common';
import {
  BusinessRuleError,
  ConflictError,
  EnvKeyProvider,
  NotFoundError,
  encryptString,
} from '@galatura/platform-kit';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import type { RequestContext } from '../common/request';
import {
  dateKey,
  dateOnly,
  money,
  moneyText,
  requiredString,
  roundMoney,
  uuid,
} from '../common/validation';
import { maskedAccount } from '../common/serialize';

const DIRECTIONS = ['DEBIT', 'CREDIT'] as const;

@Injectable()
export class ReconciliationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async listBankAccounts() {
    const rows = await this.prisma.companyBankAccount.findMany({ orderBy: { bankName: 'asc' } });
    return rows.map((row) => this.serializeBankAccount(row));
  }

  async createBankAccount(input: any, context: RequestContext) {
    const bankName = requiredString(input?.bankName, 'bankName');
    const branch = input?.branch ? requiredString(input.branch, 'branch') : undefined;
    const accountNumber = requiredString(input?.accountNumber, 'accountNumber');
    const ledgerAccountId = uuid(input?.ledgerAccountId, 'ledgerAccountId');
    const accountNumberEnc = await encryptString(accountNumber, EnvKeyProvider.fromEnv());
    const accountNumberMasked = maskedAccount(accountNumber);

    const row = await this.prisma.companyBankAccount.create({
      data: {
        bankName,
        branch,
        accountNumberEnc,
        accountNumberMasked,
        ledgerAccountId,
        active: true,
      },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'bankAccount.created',
      entityType: 'CompanyBankAccount',
      entityId: row.id,
      metadata: { bankName },
    });
    return this.serializeBankAccount(row);
  }

  async listReconciliations() {
    const rows = await this.prisma.bankReconciliation.findMany({
      orderBy: { statementDate: 'desc' },
    });
    return rows.map((row) => this.serializeReconciliation(row));
  }

  async createReconciliation(input: any, context: RequestContext) {
    const bankAccountId = uuid(input?.bankAccountId, 'bankAccountId');
    const statementDate = dateOnly(input?.statementDate, 'statementDate');
    const statementBalance = money(input?.statementBalance, 'statementBalance');
    const bankAccount = await this.prisma.companyBankAccount.findUnique({
      where: { id: bankAccountId },
    });
    if (!bankAccount) throw new NotFoundError('Bank account not found.');

    const row = await this.prisma.bankReconciliation.create({
      data: {
        bankAccountId,
        statementDate,
        statementBalance,
        status: 'OPEN' as any,
      },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'reconciliation.created',
      entityType: 'BankReconciliation',
      entityId: row.id,
    });
    return this.serializeReconciliation(row);
  }

  async addReconciliationLine(id: string, input: any, context: RequestContext) {
    const reconciliation = await this.prisma.bankReconciliation.findUnique({ where: { id } });
    if (!reconciliation) throw new NotFoundError('Bank reconciliation not found.');
    if (reconciliation.status === 'COMPLETE')
      throw new ConflictError('Bank reconciliation is complete.');

    const statementLineDate = dateOnly(input?.statementLineDate, 'statementLineDate');
    const description = requiredString(input?.description, 'description');
    const amount = money(input?.amount, 'amount');
    const direction = this.oneOf(input?.direction, DIRECTIONS, 'direction');

    const row = await this.prisma.bankStatementLine.create({
      data: {
        reconciliationId: id,
        statementLineDate,
        description,
        amount,
        direction,
      },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'reconciliationLine.created',
      entityType: 'BankStatementLine',
      entityId: row.id,
    });
    return this.serializeStatementLine(row);
  }

  async matchReconciliation(id: string, input: any, context: RequestContext) {
    const reconciliation = await this.prisma.bankReconciliation.findUnique({ where: { id } });
    if (!reconciliation) throw new NotFoundError('Bank reconciliation not found.');
    if (reconciliation.status === 'COMPLETE')
      throw new ConflictError('Bank reconciliation is complete.');

    const lineId = uuid(input?.lineId, 'lineId');
    const journalLineId = uuid(input?.journalLineId, 'journalLineId');
    const line = await this.prisma.bankStatementLine.findUnique({ where: { id: lineId } });
    if (!line || line.reconciliationId !== id)
      throw new NotFoundError('Bank statement line not found.');
    if (line.matchedJournalLineId)
      throw new ConflictError('Bank statement line is already matched.');

    const journalLine = await this.prisma.journalLine.findUnique({ where: { id: journalLineId } });
    if (!journalLine) throw new NotFoundError('Journal line not found.');
    const statementAmount = roundMoney(Number(line.amount));
    const journalAmount = roundMoney(
      Math.abs(Number(journalLine.debit) - Number(journalLine.credit)),
    );
    if (statementAmount !== journalAmount) {
      throw new BusinessRuleError('Bank statement line amount does not match the journal line.');
    }

    const updatedLine = await this.prisma.bankStatementLine.update({
      where: { id: lineId },
      data: { matchedJournalLineId: journalLineId },
    });
    const lines = await this.prisma.bankStatementLine.findMany({ where: { reconciliationId: id } });
    const complete = lines.every((candidate: any) => candidate.matchedJournalLineId);
    const updated = await this.prisma.bankReconciliation.update({
      where: { id },
      data: { status: (complete ? 'COMPLETE' : 'MATCHED') as any },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'reconciliationLine.matched',
      entityType: 'BankReconciliation',
      entityId: id,
      metadata: { lineId, journalLineId },
    });
    return {
      reconciliation: this.serializeReconciliation(updated),
      line: this.serializeStatementLine(updatedLine),
    };
  }

  private oneOf(value: unknown, values: readonly string[], label: string): string {
    const text = requiredString(value, label);
    if (!values.includes(text))
      throw new BusinessRuleError(`${label} must be one of ${values.join(', ')}.`);
    return text;
  }

  private serializeBankAccount(row: any) {
    return {
      id: row.id,
      bankName: row.bankName,
      branch: row.branch ?? null,
      accountNumberMasked: row.accountNumberMasked,
      ledgerAccountId: row.ledgerAccountId,
      active: Boolean(row.active),
    };
  }

  private serializeReconciliation(row: any) {
    return {
      id: row.id,
      bankAccountId: row.bankAccountId,
      statementDate: dateKey(new Date(row.statementDate)),
      statementBalance: moneyText(row.statementBalance),
      status: row.status,
    };
  }

  private serializeStatementLine(row: any) {
    return {
      id: row.id,
      reconciliationId: row.reconciliationId,
      statementLineDate: dateKey(new Date(row.statementLineDate)),
      description: row.description,
      amount: moneyText(row.amount),
      direction: row.direction,
      matchedJournalLineId: row.matchedJournalLineId ?? null,
    };
  }
}
