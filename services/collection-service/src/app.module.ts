import { Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { CollectionAuditService } from './audit/audit.service';
import { OutboxService } from './outbox/outbox.service';
import { MasterDataController } from './master-data/master-data.controller';
import { MasterDataService } from './master-data/master-data.service';
import { PickupsController } from './pickups/pickups.controller';
import { PickupsService } from './pickups/pickups.service';
import { SyncController } from './sync/sync.controller';
import { SyncService } from './sync/sync.service';
import { WeighingsController } from './weighings/weighings.controller';
import { WeighingsService } from './weighings/weighings.service';

@Module({
  controllers: [MasterDataController, PickupsController, SyncController, WeighingsController],
  providers: [
    PrismaService,
    CollectionAuditService,
    OutboxService,
    MasterDataService,
    PickupsService,
    SyncService,
    WeighingsService,
  ],
})
export class AppModule {}
