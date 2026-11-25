import { uuidv7 } from '@galatura/platform-kit';
import { createFakePrisma } from './fake-prisma';

export function createTestPrisma() {
  const accountIds = {
    cash: uuidv7(),
    bank: uuidv7(),
    supplierAdvances: uuidv7(),
    inventory: uuidv7(),
    storesInventory: uuidv7(),
    income: uuidv7(),
    purchases: uuidv7(),
    factoryConsumables: uuidv7(),
    supplierPayable: uuidv7(),
    tradePayables: uuidv7(),
    wagesPayable: uuidv7(),
    epfPayable: uuidv7(),
    etfPayable: uuidv7(),
    taxPayable: uuidv7(),
    wagesExpense: uuidv7(),
    employerEpfExpense: uuidv7(),
    employerEtfExpense: uuidv7(),
    capital: uuidv7(),
    retainedEarnings: uuidv7(),
  };

  const fiscalYearId = uuidv7();
  const periodId = uuidv7();
  const supplierId = uuidv7();
  const personId = uuidv7();

  const account = (
    id: string,
    code: string,
    name: string,
    accountType: string,
    normalBalance: string,
    extra: any = {},
  ) => ({
    id,
    code,
    name,
    accountType,
    normalBalance,
    parentId: null,
    isPostable: true,
    isControl: false,
    partyType: null,
    active: true,
    statement: null,
    sectionId: null,
    sortOrder: 0,
    cashFlowCategory: null,
    isCashAccount: false,
    allowManualPosting: true,
    deactivatedAt: null,
    openingBalanceEntryId: null,
    version: 0,
    ...extra,
  });

  const prisma = createFakePrisma({
    account: [
      account(accountIds.cash, '1000', 'Cash', 'ASSET', 'DEBIT', {
        isCashAccount: true,
        cashFlowCategory: 'OPERATING',
      }),
      account(accountIds.bank, '1010', 'Bank', 'ASSET', 'DEBIT', {
        isCashAccount: true,
        cashFlowCategory: 'OPERATING',
      }),
      account(accountIds.supplierAdvances, '1100', 'Supplier advances', 'ASSET', 'DEBIT'),
      account(accountIds.inventory, '1200', 'Made tea inventory', 'ASSET', 'DEBIT'),
      account(accountIds.storesInventory, '1210', 'Stores and packing inventory', 'ASSET', 'DEBIT'),
      account(accountIds.supplierPayable, '2000', 'Supplier payable', 'LIABILITY', 'CREDIT', {
        isControl: true,
        partyType: 'SUPPLIER',
        allowManualPosting: false,
      }),
      account(accountIds.wagesPayable, '2010', 'Wages payable', 'LIABILITY', 'CREDIT', {
        isControl: true,
        partyType: 'EMPLOYEE',
        allowManualPosting: false,
      }),
      account(accountIds.epfPayable, '2020', 'EPF payable', 'LIABILITY', 'CREDIT'),
      account(accountIds.etfPayable, '2030', 'ETF payable', 'LIABILITY', 'CREDIT'),
      account(accountIds.taxPayable, '2040', 'PAYE payable', 'LIABILITY', 'CREDIT'),
      account(accountIds.tradePayables, '2050', 'Trade payables', 'LIABILITY', 'CREDIT', {
        isControl: true,
        partyType: 'SUPPLIER',
        allowManualPosting: false,
      }),
      account(accountIds.income, '4000', 'Made tea sales', 'INCOME', 'CREDIT', {
        statement: 'PROFIT_LOSS',
        sectionId: 'INCOME',
      }),
      account(accountIds.purchases, '5000', 'Green leaf purchases', 'EXPENSE', 'DEBIT', {
        statement: 'PROFIT_LOSS',
        sectionId: 'DIRECT_COSTS',
      }),
      account(accountIds.factoryConsumables, '5030', 'Factory consumables', 'EXPENSE', 'DEBIT', {
        statement: 'PROFIT_LOSS',
        sectionId: 'DIRECT_COSTS',
      }),
      account(accountIds.wagesExpense, '5010', 'Direct factory labour', 'EXPENSE', 'DEBIT', {
        statement: 'PROFIT_LOSS',
        sectionId: 'DIRECT_COSTS',
      }),
      account(accountIds.employerEpfExpense, '5110', 'Employer EPF expense', 'EXPENSE', 'DEBIT', {
        statement: 'PROFIT_LOSS',
        sectionId: 'ADMIN',
      }),
      account(accountIds.employerEtfExpense, '5120', 'Employer ETF expense', 'EXPENSE', 'DEBIT', {
        statement: 'PROFIT_LOSS',
        sectionId: 'ADMIN',
      }),
      account(accountIds.capital, '3000', 'Capital', 'EQUITY', 'CREDIT', {
        statement: 'BALANCE_SHEET',
        sectionId: 'EQUITY',
      }),
      account(accountIds.retainedEarnings, '3010', 'Retained earnings', 'EQUITY', 'CREDIT', {
        statement: 'BALANCE_SHEET',
        sectionId: 'EQUITY',
      }),
    ],
    fiscalYear: [
      {
        id: fiscalYearId,
        name: '2026',
        startDate: new Date('2026-01-01'),
        endDate: new Date('2026-12-31'),
        status: 'OPEN',
      },
    ],
    fiscalPeriod: [
      {
        id: periodId,
        fiscalYearId,
        name: '2026-11',
        startDate: new Date('2026-11-01'),
        endDate: new Date('2026-11-30'),
        status: 'OPEN',
        closedAt: null,
        closedBy: null,
      },
    ],
    teaRate: [
      {
        id: uuidv7(),
        grade: 'STANDARD',
        ratePerKg: '50.00',
        effectiveFrom: new Date('2026-01-01'),
        effectiveTo: null,
        approver: null,
      },
    ],
    wageComponent: [
      {
        id: uuidv7(),
        code: 'BASIC',
        name: 'Basic wages',
        componentType: 'EARNING',
        taxable: true,
        formula: { basis: 'DAILY' },
        active: true,
      },
      {
        id: uuidv7(),
        code: 'OVERTIME',
        name: 'Overtime',
        componentType: 'EARNING',
        taxable: true,
        formula: { multiplier: 1.5 },
        active: true,
      },
      {
        id: uuidv7(),
        code: 'EPF_EMPLOYEE',
        name: 'Employee EPF',
        componentType: 'DEDUCTION',
        taxable: false,
        formula: { rate: 0.08 },
        active: true,
      },
      {
        id: uuidv7(),
        code: 'ETF',
        name: 'ETF',
        componentType: 'DEDUCTION',
        taxable: false,
        formula: { rate: 0.03 },
        active: true,
      },
    ],
  });

  return { prisma, accountIds, periodId, fiscalYearId, supplierId, personId };
}
