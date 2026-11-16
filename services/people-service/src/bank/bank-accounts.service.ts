import { Injectable } from '@nestjs/common';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  uuidv7,
} from '@galatura/platform-kit';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from '../crypto/encryption.service';
import { BankAccountStatus } from '../../generated/prisma';

export interface AddBankAccountInput {
  bankName: string;
  bankCode?: string;
  branchName?: string;
  branchCode?: string;
  accountHolderName: string;
  accountNumber: string;
  isPrimary?: boolean;
}

@Injectable()
export class BankAccountsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  async addBankAccount(
    personId: string,
    input: AddBankAccountInput,
    creatorId?: string,
  ) {
    const person = await this.prisma.person.findUnique({
      where: { id: personId, deletedAt: null },
    });
    if (!person) throw new NotFoundError(`Person ${personId} not found.`);

    const cleanAccNo = input.accountNumber.trim().replace(/[\s-]/g, '');
    const accountLast4 = cleanAccNo.slice(-4);
    const accountNumberEnc = await this.encryption.encrypt(cleanAccNo);
    const accountNumberHash = this.encryption.computeBlindIndex(cleanAccNo);

    // Duplicate check across verified/active accounts
    const existing = await this.prisma.bankAccount.findFirst({
      where: {
        accountNumberHash,
        status: { in: ['VERIFIED', 'PENDING_VERIFY'] },
        personId: { not: personId },
      },
    });
    if (existing) {
      throw new ConflictError('This bank account number is already linked to another person.');
    }

    const isPrimary = input.isPrimary ?? true;

    return this.prisma.$transaction(async (tx) => {
      if (isPrimary) {
        await tx.bankAccount.updateMany({
          where: { personId, isPrimary: true },
          data: { isPrimary: false },
        });
      }

      const account = await tx.bankAccount.create({
        data: {
          id: uuidv7(),
          personId,
          bankName: input.bankName,
          bankCode: input.bankCode,
          branchName: input.branchName,
          branchCode: input.branchCode,
          accountHolderName: input.accountHolderName,
          accountNumberEnc,
          accountNumberHash,
          accountLast4,
          isPrimary,
          status: 'PENDING_VERIFY',
        },
      });

      // Audit trail
      await tx.personChangeLog.create({
        data: {
          id: uuidv7(),
          personId,
          field: 'bank_account',
          oldValueMasked: null,
          newValueMasked: `${input.bankName} - ******${accountLast4}`,
          changedBy: creatorId ?? null,
        },
      });

      return account;
    });
  }

  async verifyBankAccount(accountId: string, verifierId: string) {
    const account = await this.prisma.bankAccount.findUnique({
      where: { id: accountId },
    });
    if (!account) throw new NotFoundError(`Bank account ${accountId} not found.`);

    if (account.status === 'VERIFIED') {
      return account;
    }

    // Check if the verifier was the creator from the change log (maker-checker violation)
    const creatorLog = await this.prisma.personChangeLog.findFirst({
      where: {
        personId: account.personId,
        field: 'bank_account',
        newValueMasked: { contains: account.accountLast4 },
      },
      orderBy: { changedAt: 'asc' },
    });

    if (creatorLog && creatorLog.changedBy === verifierId) {
      throw new ForbiddenError(
        'Maker-checker violation: You cannot verify a bank account that you added.',
      );
    }

    return this.prisma.bankAccount.update({
      where: { id: accountId },
      data: {
        status: 'VERIFIED',
        verifiedBy: verifierId,
        verifiedAt: new Date(),
      },
    });
  }

  async listBankAccounts(personId: string, canReadSensitive = false) {
    const accounts = await this.prisma.bankAccount.findMany({
      where: { personId },
      orderBy: [{ isPrimary: 'desc' }, { createdAt: 'desc' }],
    });

    return Promise.all(
      accounts.map(async (acc) => {
        let fullAccountNumber: string | undefined;
        if (canReadSensitive) {
          fullAccountNumber = await this.encryption.decrypt(acc.accountNumberEnc);
        }
        return {
          id: acc.id,
          personId: acc.personId,
          bankName: acc.bankName,
          bankCode: acc.bankCode,
          branchName: acc.branchName,
          branchCode: acc.branchCode,
          accountHolderName: acc.accountHolderName,
          accountLast4: acc.accountLast4,
          accountNumber: fullAccountNumber || `******${acc.accountLast4}`,
          isPrimary: acc.isPrimary,
          status: acc.status,
          verifiedBy: acc.verifiedBy,
          verifiedAt: acc.verifiedAt,
        };
      }),
    );
  }

  async setPrimary(accountId: string, personId: string) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: accountId, personId },
    });
    if (!account) throw new NotFoundError('Bank account not found.');

    await this.prisma.$transaction(async (tx) => {
      await tx.bankAccount.updateMany({
        where: { personId, isPrimary: true },
        data: { isPrimary: false },
      });
      await tx.bankAccount.update({
        where: { id: accountId },
        data: { isPrimary: true },
      });
    });
  }

  async deleteBankAccount(accountId: string, personId: string) {
    const account = await this.prisma.bankAccount.findFirst({
      where: { id: accountId, personId },
    });
    if (!account) throw new NotFoundError('Bank account not found.');

    await this.prisma.bankAccount.delete({ where: { id: accountId } });
  }
}
