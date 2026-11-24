import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma/prisma.service';
import { AuditService } from './audit/audit.service';
import { OutboxService } from './outbox/outbox.service';
import { AccountsService } from './accounts/accounts.service';
import { AccountsController } from './accounts/accounts.controller';
import { JournalService } from './journal/journal.service';
import { JournalController } from './journal/journal.controller';
import { BillingService } from './billing/billing.service';
import { BillingController } from './billing/billing.controller';
import { PayrollService } from './payroll/payroll.service';
import { PayrollController } from './payroll/payroll.controller';
import { PaymentsService } from './payments/payments.service';
import { PaymentsController } from './payments/payments.controller';
import { ReportsService } from './reports/reports.service';
import { ReportsController } from './reports/reports.controller';
import { ReconciliationService } from './reconciliation/reconciliation.service';
import { ReconciliationController } from './reconciliation/reconciliation.controller';
import { EventsService } from './events/events.service';
import { EventsController } from './events/events.controller';
import { InventoryAccountsService } from './inventory/inventory-accounts.service';

@Module({
  controllers: [
    HealthController,
    AccountsController,
    JournalController,
    BillingController,
    PayrollController,
    PaymentsController,
    ReportsController,
    ReconciliationController,
    EventsController,
  ],
  providers: [
    PrismaService,
    AuditService,
    OutboxService,
    AccountsService,
    JournalService,
    BillingService,
    PayrollService,
    PaymentsService,
    ReportsService,
    ReconciliationService,
    EventsService,
    InventoryAccountsService,
  ],
})
export class AppModule {}
