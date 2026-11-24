import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma/prisma.service';
import { AuditService } from './audit/audit.service';
import { OutboxService } from './outbox/outbox.service';
import { CatalogService } from './catalog/catalog.service';
import { CatalogController } from './catalog/catalog.controller';
import { StockService } from './stock/stock.service';
import { StockController } from './stock/stock.controller';
import { EventsService } from './events/events.service';
import { EventsController } from './events/events.controller';

@Module({
  controllers: [HealthController, CatalogController, StockController, EventsController],
  providers: [
    PrismaService,
    AuditService,
    OutboxService,
    CatalogService,
    StockService,
    EventsService,
  ],
})
export class AppModule {}
