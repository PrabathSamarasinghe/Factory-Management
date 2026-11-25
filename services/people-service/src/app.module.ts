import { Module } from '@nestjs/common';
import { createFileStorage } from '@galatura/platform-kit';
import { PrismaService } from './prisma/prisma.service';
import { EncryptionService } from './crypto/encryption.service';
import { SupplierRegNoService } from './suppliers/supplier-reg-no.service';
import { PersonsService } from './persons/persons.service';
import { PersonsController } from './persons/persons.controller';
import { BankAccountsService } from './bank/bank-accounts.service';
import { BankAccountsController } from './bank/bank-accounts.controller';
import { DocumentsService } from './documents/documents.service';
import { DocumentsController } from './documents/documents.controller';
import { BarcodesService } from './barcodes/barcodes.service';
import { BarcodesController } from './barcodes/barcodes.controller';
import { FILE_STORAGE } from './storage';
import { OutboxService } from './outbox/outbox.service';
import { ConsentWithdrawalDispatcher } from './events/consent-withdrawal-dispatcher';

@Module({
  imports: [],
  controllers: [PersonsController, BankAccountsController, DocumentsController, BarcodesController],
  providers: [
    PrismaService,
    EncryptionService,
    SupplierRegNoService,
    PersonsService,
    BankAccountsService,
    DocumentsService,
    BarcodesService,
    OutboxService,
    ConsentWithdrawalDispatcher,
    {
      provide: FILE_STORAGE,
      useFactory: () => createFileStorage(),
    },
  ],
  exports: [
    PrismaService,
    EncryptionService,
    SupplierRegNoService,
    PersonsService,
    BankAccountsService,
    DocumentsService,
    BarcodesService,
    OutboxService,
    ConsentWithdrawalDispatcher,
  ],
})
export class AppModule {}
