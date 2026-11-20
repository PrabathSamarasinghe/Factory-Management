import { Injectable } from '@nestjs/common';
import { BusinessRuleError, ConflictError, NotFoundError } from '@galatura/platform-kit';
import type { EventEnvelope } from '@galatura/platform-kit';
import { AccountsService } from '../accounts/accounts.service';
import { AuditService } from '../audit/audit.service';
import { JournalService } from '../journal/journal.service';
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
import { maskedAccount, serializePayrollRun } from '../common/serialize';

const RUN_TYPES = ['MONTHLY', 'WEEKLY', 'DAILY'] as const;
const COMPONENT_TYPES = ['EARNING', 'DEDUCTION'] as const;
const MINUTES_PER_DAY = 480;

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly accounts: AccountsService,
    private readonly journal: JournalService,
  ) {}

  async listWageComponents() {
    const rows = await this.prisma.wageComponent.findMany({ orderBy: { code: 'asc' } });
    return rows.map((row) => this.serializeWageComponent(row));
  }

  async createWageComponent(input: any, context: RequestContext) {
    const code = requiredString(input?.code, 'code');
    const name = requiredString(input?.name, 'name');
    const componentType = this.oneOf(input?.componentType, COMPONENT_TYPES, 'componentType');
    const existing = await this.prisma.wageComponent.findUnique({ where: { code } });
    if (existing) throw new ConflictError('Wage component code already exists.');

    const row = await this.prisma.wageComponent.create({
      data: {
        code,
        name,
        componentType: componentType as any,
        taxable: input?.taxable === undefined ? false : Boolean(input.taxable),
        formula: input?.formula ?? null,
        active: input?.active === undefined ? true : Boolean(input.active),
      },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'wageComponent.created',
      entityType: 'WageComponent',
      entityId: row.id,
      metadata: { code },
    });
    return this.serializeWageComponent(row);
  }

  async listPayrollRuns() {
    const rows = await this.prisma.payrollRun.findMany({ orderBy: { periodTo: 'desc' } });
    return rows.map((row) => serializePayrollRun(row));
  }

  async ingestAttendanceDay(event: EventEnvelope<any>) {
    const payload = event?.payload ?? {};
    const eventId = uuid(event?.id, 'event.id');
    const personId = uuid(payload.personId, 'payload.personId');
    const workDate = dateOnly(payload.workDate, 'payload.workDate');
    const status = requiredString(payload.status, 'payload.status');
    const workedMinutes = this.nonNegativeInt(payload.workedMinutes, 'payload.workedMinutes');
    const overtimeMinutes = this.nonNegativeInt(payload.overtimeMinutes, 'payload.overtimeMinutes');
    const approved =
      payload.approved === undefined
        ? ['PRESENT', 'HALF_DAY'].includes(status)
        : Boolean(payload.approved);

    const existing = await this.prisma.attendanceDay.findUnique({ where: { eventId } });
    if (existing) return { eventId, duplicate: true, attendanceDayId: existing.id };

    const row = await this.prisma.attendanceDay.create({
      data: {
        eventId,
        personId,
        workDate,
        status,
        workedMinutes,
        overtimeMinutes,
        approved,
      },
    });
    return { eventId, duplicate: false, attendanceDayId: row.id };
  }

  async calculatePayroll(input: any, context: RequestContext) {
    const periodFrom = dateOnly(input?.periodFrom, 'periodFrom');
    const periodTo = dateOnly(input?.periodTo, 'periodTo');
    if (periodTo < periodFrom)
      throw new BusinessRuleError('periodTo must not be before periodFrom.');
    const runType = this.oneOf(input?.runType ?? 'MONTHLY', RUN_TYPES, 'runType');
    const idempotencyKey = requiredString(input?.idempotencyKey, 'idempotencyKey');
    const employees = requiredArray(input?.employees, 'employees');

    const existing = await this.prisma.payrollRun.findUnique({ where: { idempotencyKey } });
    if (existing) {
      const items = await this.prisma.payrollItem.findMany({ where: { runId: existing.id } });
      return { run: serializePayrollRun(existing, items), duplicate: true };
    }

    const components = await this.prisma.wageComponent.findMany({ where: { active: true } });
    const epfEmployeeRate = this.componentRate(components, 'EPF_EMPLOYEE', 0.08);
    const epfEmployerRate = this.componentRate(components, 'EPF_EMPLOYER', epfEmployeeRate);
    const etfRate = this.componentRate(components, 'ETF', 0.03);
    const overtimeMultiplier = this.componentRate(components, 'OVERTIME', 1.5);

    const attendance = (await this.prisma.attendanceDay.findMany()).filter((day: any) => {
      const date = new Date(day.workDate);
      return day.approved && date >= periodFrom && date <= periodTo;
    });

    const prepared = employees.map((raw: any) => {
      const personId = uuid(raw?.personId, 'employee.personId');
      const dailyWage = money(raw?.dailyWage, 'employee.dailyWage');
      const days = attendance.filter((day: any) => day.personId === personId);
      const daysWorked = roundMoney(
        days.reduce(
          (sum: number, day: any) => sum + Math.min(1, day.workedMinutes / MINUTES_PER_DAY),
          0,
        ),
      );
      const overtimeHours = roundMoney(
        days.reduce((sum: number, day: any) => sum + day.overtimeMinutes / 60, 0),
      );
      const basic = roundMoney(Number(dailyWage) * daysWorked);
      const overtime = roundMoney((Number(dailyWage) / 8) * overtimeMultiplier * overtimeHours);
      const grossAmount = roundMoney(basic + overtime);
      const epfEmployee = roundMoney(grossAmount * epfEmployeeRate);
      const epfEmployer = roundMoney(grossAmount * epfEmployerRate);
      const etf = roundMoney(grossAmount * etfRate);
      const otherDeductions =
        raw?.otherDeductions === undefined
          ? 0
          : roundMoney(Number(money(raw.otherDeductions, 'employee.otherDeductions')));
      const netPay = roundMoney(grossAmount - epfEmployee - otherDeductions);
      if (netPay < 0) throw new BusinessRuleError('Net pay cannot be negative.');
      const bankSnapshotMasked = raw?.bankAccount
        ? maskedAccount(requiredString(raw.bankAccount, 'employee.bankAccount'))
        : optionalString(raw?.bankAccountMasked, 'employee.bankAccountMasked');

      return {
        personId,
        daysWorked: daysWorked.toFixed(2),
        overtimeHours: overtimeHours.toFixed(2),
        grossAmount: moneyText(grossAmount),
        epfEmployee: moneyText(epfEmployee),
        epfEmployer: moneyText(epfEmployer),
        etf: moneyText(etf),
        otherDeductions: moneyText(otherDeductions),
        netPay: moneyText(netPay),
        bankSnapshotMasked,
        componentAmounts: [
          ['BASIC', basic],
          ['OVERTIME', overtime],
          ['EPF_EMPLOYEE', epfEmployee],
          ['ETF', etf],
        ] as Array<[string, number]>,
      };
    });

    const grossTotal = roundMoney(
      prepared.reduce((sum, item) => sum + Number(item.grossAmount), 0),
    );
    const deductionTotal = roundMoney(
      prepared.reduce(
        (sum, item) => sum + Number(item.epfEmployee) + Number(item.otherDeductions),
        0,
      ),
    );
    const netTotal = roundMoney(prepared.reduce((sum, item) => sum + Number(item.netPay), 0));
    const employerCost = roundMoney(
      prepared.reduce(
        (sum, item) => sum + Number(item.grossAmount) + Number(item.epfEmployer) + Number(item.etf),
        0,
      ),
    );

    const run = await this.prisma.$transaction(async (tx: any) => {
      const created = await tx.payrollRun.create({
        data: {
          periodFrom,
          periodTo,
          runType: runType as any,
          status: 'CALCULATED' as any,
          grossTotal: moneyText(grossTotal),
          deductionTotal: moneyText(deductionTotal),
          netTotal: moneyText(netTotal),
          employerCost: moneyText(employerCost),
          idempotencyKey,
        },
      });

      for (const item of prepared) {
        const payrollItem = await tx.payrollItem.create({
          data: {
            runId: created.id,
            personId: item.personId,
            daysWorked: item.daysWorked,
            overtimeHours: item.overtimeHours,
            grossAmount: item.grossAmount,
            epfEmployee: item.epfEmployee,
            epfEmployer: item.epfEmployer,
            etf: item.etf,
            otherDeductions: item.otherDeductions,
            netPay: item.netPay,
            bankSnapshotMasked: item.bankSnapshotMasked,
            paymentStatus: 'PENDING',
          },
        });
        for (const [code, amount] of item.componentAmounts) {
          const component = components.find((candidate: any) => candidate.code === code);
          if (!component) continue;
          await tx.payrollItemLine.create({
            data: {
              itemId: payrollItem.id,
              componentId: component.id,
              amount: moneyText(amount),
            },
          });
        }
      }

      await this.audit.record(
        {
          actorId: context.actorId,
          action: 'payroll.calculated',
          entityType: 'PayrollRun',
          entityId: created.id,
          metadata: { employees: prepared.length, netTotal: moneyText(netTotal) },
        },
        tx,
      );
      return created;
    });

    const items = await this.prisma.payrollItem.findMany({ where: { runId: run.id } });
    return { run: serializePayrollRun(run, items), duplicate: false };
  }

  async approvePayrollRun(id: string, input: any, context: RequestContext) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id } });
    if (!run) throw new NotFoundError('Payroll run not found.');
    if (run.status !== 'CALCULATED') throw new ConflictError('Payroll run is not calculated.');

    const items = await this.prisma.payrollItem.findMany({ where: { runId: id } });
    if (items.length === 0) throw new BusinessRuleError('Payroll run has no employees.');

    const wagesAccount = await this.accounts.accountByCode('5010');
    const employerEpfAccount = await this.accounts.accountByCode('5110');
    const employerEtfAccount = await this.accounts.accountByCode('5120');
    const wagesPayableAccount = await this.accounts.accountByCode('2010');
    const epfPayableAccount = await this.accounts.accountByCode('2020');
    const etfPayableAccount = await this.accounts.accountByCode('2030');
    const deductionsAccount = await this.accounts.accountByCode('2040');

    const idempotencyKey = requiredString(
      input?.idempotencyKey ?? `payroll-run:${id}`,
      'idempotencyKey',
    );
    let lastEntryId = '';

    for (const item of items) {
      const gross = Number(item.grossAmount);
      const epfEmployee = Number(item.epfEmployee);
      const epfEmployer = Number(item.epfEmployer);
      const etf = Number(item.etf);
      const other = Number(item.otherDeductions);
      const net = Number(item.netPay);
      const entry = await this.journal.postSystem(
        {
          entryDate: dateKey(new Date(run.periodTo)),
          description: `Payroll ${dateKey(new Date(run.periodFrom))} to ${dateKey(new Date(run.periodTo))}`,
          sourceType: 'PAYROLL',
          sourceId: item.personId,
          idempotencyKey: `${idempotencyKey}:${item.id}`,
          lines: [
            { accountId: wagesAccount.id, debit: moneyText(gross), credit: '0.00' },
            { accountId: employerEpfAccount.id, debit: moneyText(epfEmployer), credit: '0.00' },
            { accountId: employerEtfAccount.id, debit: moneyText(etf), credit: '0.00' },
            {
              accountId: wagesPayableAccount.id,
              debit: '0.00',
              credit: moneyText(net),
              partyType: 'EMPLOYEE',
              partyId: item.personId,
            },
            {
              accountId: epfPayableAccount.id,
              debit: '0.00',
              credit: moneyText(epfEmployee + epfEmployer),
            },
            { accountId: etfPayableAccount.id, debit: '0.00', credit: moneyText(etf) },
            ...(other > 0
              ? [{ accountId: deductionsAccount.id, debit: '0.00', credit: moneyText(other) }]
              : []),
          ],
        },
        context,
      );
      lastEntryId = entry.id;
      await this.prisma.payrollItem.update({
        where: { id: item.id },
        data: { paymentStatus: 'APPROVED' },
      });
    }

    const updated = await this.prisma.payrollRun.update({
      where: { id },
      data: {
        status: 'APPROVED' as any,
        approvedBy: context.actorId,
        approvedAt: new Date(),
        journalEntryId: lastEntryId,
      },
    });
    await this.audit.record({
      actorId: context.actorId,
      action: 'payroll.approved',
      entityType: 'PayrollRun',
      entityId: id,
    });
    return serializePayrollRun(updated, items);
  }

  async wagesDue(personId: string, asOf?: Date) {
    const account = await this.accounts.accountByCode('2010');
    const ledger = await this.journal.ledger(account.id, { asOf, partyId: personId });
    const balance = Number(ledger.closingBalance);
    return {
      personId,
      asOf: asOf ? dateKey(asOf) : null,
      ledgerBalance: moneyText(balance),
      wagesDue: moneyText(-balance),
      rows: ledger.rows,
    };
  }

  private componentRate(components: any[], code: string, fallback: number): number {
    const component = components.find((candidate) => candidate.code === code);
    if (!component?.formula) return fallback;
    try {
      const formula =
        typeof component.formula === 'string' ? JSON.parse(component.formula) : component.formula;
      const value = Number(formula?.rate ?? formula?.multiplier);
      return Number.isFinite(value) && value > 0 ? value : fallback;
    } catch {
      return fallback;
    }
  }

  private nonNegativeInt(value: unknown, label: string): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed < 0) {
      throw new BusinessRuleError(`${label} must be a non-negative whole number.`);
    }
    return parsed;
  }

  private oneOf(value: unknown, values: readonly string[], label: string): string {
    const text = requiredString(value, label);
    if (!values.includes(text))
      throw new BusinessRuleError(`${label} must be one of ${values.join(', ')}.`);
    return text;
  }

  private serializeWageComponent(row: any) {
    return {
      id: row.id,
      code: row.code,
      name: row.name,
      componentType: row.componentType,
      taxable: Boolean(row.taxable),
      formula: row.formula ?? null,
      active: Boolean(row.active),
    };
  }
}
