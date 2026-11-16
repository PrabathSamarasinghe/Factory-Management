import { beforeEach, describe, expect, it } from 'vitest';
import { ConflictError, ForbiddenError, NotFoundError } from '@galatura/platform-kit';
import { BankAccountsService } from '../src/bank/bank-accounts.service';
import { EncryptionService } from '../src/crypto/encryption.service';

function buildPrisma(people: Map<string, any>) {
  const accounts: any[] = [];
  const changeLogs: any[] = [];

  const prisma: any = {
    person: {
      findUnique: async (args: any) => {
        const p = people.get(args.where.id);
        if (!p || p.deletedAt) return null;
        return p;
      },
    },
    bankAccount: {
      findFirst: async (args: any) => {
        const where = args.where;
        if (where.id) {
          return (
            accounts.find(
              (a) => a.id === where.id && (!where.personId || a.personId === where.personId),
            ) ?? null
          );
        }
        return (
          accounts.find(
            (a) =>
              a.accountNumberHash === where.accountNumberHash &&
              (where.personId?.not ? a.personId !== where.personId.not : true) &&
              (!where.status?.in || where.status.in.includes(a.status)),
          ) ?? null
        );
      },
      findUnique: async (args: any) => accounts.find((a) => a.id === args.where.id) ?? null,
      findMany: async (args: any) =>
        accounts
          .filter((a) => a.personId === args.where.personId)
          .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary)),
      create: async (args: any) => {
        const row = { ...args.data, verifiedBy: null, verifiedAt: null };
        accounts.push(row);
        return row;
      },
      update: async (args: any) => {
        const row = accounts.find((a) => a.id === args.where.id);
        Object.assign(row, args.data);
        return row;
      },
      updateMany: async (args: any) => {
        accounts
          .filter((a) => a.personId === args.where.personId && a.isPrimary)
          .forEach((a) => Object.assign(a, args.data));
        return { count: 0 };
      },
      delete: async (args: any) => {
        const index = accounts.findIndex((a) => a.id === args.where.id);
        const [row] = accounts.splice(index, 1);
        return row;
      },
    },
    personChangeLog: {
      create: async (args: any) => {
        changeLogs.push(args.data);
        return args.data;
      },
      findFirst: async (args: any) => {
        const w = args.where;
        return (
          changeLogs.find(
            (l) =>
              l.personId === w.personId &&
              l.field === w.field &&
              l.newValueMasked?.includes(w.newValueMasked.contains),
          ) ?? null
        );
      },
    },
    __accounts: accounts,
    __changeLogs: changeLogs,
    $transaction: async (fn: any) => fn(prisma),
  };

  return prisma;
}

describe('BankAccountsService', () => {
  const personId = '11111111-1111-1111-1111-111111111111';
  let service: BankAccountsService;
  let prisma: any;
  let encryption: EncryptionService;
  let people: Map<string, any>;

  beforeEach(() => {
    people = new Map([[personId, { id: personId, deletedAt: null }]]);
    prisma = buildPrisma(people);
    encryption = new EncryptionService();
    service = new BankAccountsService(prisma, encryption);
  });

  it('adds a bank account with encrypted number, last4 and blind index', async () => {
    const account = await service.addBankAccount(
      personId,
      {
        bankName: 'Commercial Bank',
        accountHolderName: 'Nimal Perera',
        accountNumber: '8001234567',
      },
      'creator-1',
    );

    expect(account.status).toBe('PENDING_VERIFY');
    expect(account.accountLast4).toBe('4567');
    expect(account.accountNumberEnc).not.toContain('8001234567');
    expect(account.accountNumberHash).toBe(encryption.computeBlindIndex('8001234567'));
    expect(prisma.__changeLogs).toHaveLength(1);
    expect(prisma.__changeLogs[0].newValueMasked).toContain('4567');
  });

  it('rejects an account number already linked to another person', async () => {
    const otherId = '22222222-2222-2222-2222-222222222222';
    people.set(otherId, { id: otherId, deletedAt: null });
    await service.addBankAccount(otherId, {
      bankName: 'Bank',
      accountHolderName: 'Other',
      accountNumber: '8001234567',
    });

    await expect(
      service.addBankAccount(personId, {
        bankName: 'Bank',
        accountHolderName: 'Nimal',
        accountNumber: '8001234567',
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('throws NotFoundError when the person does not exist', async () => {
    await expect(
      service.addBankAccount('missing', {
        bankName: 'Bank',
        accountHolderName: 'Nimal',
        accountNumber: '8001234567',
      }),
    ).rejects.toThrow(NotFoundError);
  });

  it('replaces the previous primary account when adding a new primary', async () => {
    const first = await service.addBankAccount(personId, {
      bankName: 'Bank A',
      accountHolderName: 'Nimal',
      accountNumber: '8001234567',
    });
    expect(first.isPrimary).toBe(true);

    await service.addBankAccount(personId, {
      bankName: 'Bank B',
      accountHolderName: 'Nimal',
      accountNumber: '8009876543',
      isPrimary: true,
    });

    const primaries = prisma.__accounts.filter((a: any) => a.personId === personId && a.isPrimary);
    expect(primaries).toHaveLength(1);
    expect(primaries[0].accountLast4).toBe('6543');
  });

  it('verifies an account when a different user performs the check', async () => {
    const account = await service.addBankAccount(
      personId,
      {
        bankName: 'Bank',
        accountHolderName: 'Nimal',
        accountNumber: '8001234567',
      },
      'creator-1',
    );

    const verified = await service.verifyBankAccount(account.id, 'checker-2');
    expect(verified.status).toBe('VERIFIED');
    expect(verified.verifiedBy).toBe('checker-2');
  });

  it('blocks the maker from verifying their own account', async () => {
    const account = await service.addBankAccount(
      personId,
      {
        bankName: 'Bank',
        accountHolderName: 'Nimal',
        accountNumber: '8001234567',
      },
      'creator-1',
    );

    await expect(service.verifyBankAccount(account.id, 'creator-1')).rejects.toThrow(
      ForbiddenError,
    );
  });

  it('returns an already verified account without re-verifying', async () => {
    const account = await service.addBankAccount(personId, {
      bankName: 'Bank',
      accountHolderName: 'Nimal',
      accountNumber: '8001234567',
    });
    account.status = 'VERIFIED';

    const result = await service.verifyBankAccount(account.id, 'checker-2');
    expect(result.status).toBe('VERIFIED');
    expect(result.verifiedBy).toBeNull();
  });

  it('masks the account number unless sensitive read is allowed', async () => {
    await service.addBankAccount(personId, {
      bankName: 'Bank',
      accountHolderName: 'Nimal',
      accountNumber: '8001234567',
    });

    const masked = await service.listBankAccounts(personId, false);
    expect(masked[0].accountNumber).toBe('******4567');

    const full = await service.listBankAccounts(personId, true);
    expect(full[0].accountNumber).toBe('8001234567');
  });

  it('sets a primary account and deletes accounts', async () => {
    const first = await service.addBankAccount(personId, {
      bankName: 'Bank A',
      accountHolderName: 'Nimal',
      accountNumber: '8001234567',
      isPrimary: false,
    });
    const second = await service.addBankAccount(personId, {
      bankName: 'Bank B',
      accountHolderName: 'Nimal',
      accountNumber: '8009876543',
      isPrimary: true,
    });

    await service.setPrimary(first.id, personId);
    expect(prisma.__accounts.find((a: any) => a.id === first.id).isPrimary).toBe(true);
    expect(prisma.__accounts.find((a: any) => a.id === second.id).isPrimary).toBe(false);

    await service.deleteBankAccount(first.id, personId);
    expect(prisma.__accounts.find((a: any) => a.id === first.id)).toBeUndefined();
  });

  it('throws NotFoundError when verifying an unknown account', async () => {
    await expect(service.verifyBankAccount('missing', 'checker-2')).rejects.toThrow(NotFoundError);
  });
});
