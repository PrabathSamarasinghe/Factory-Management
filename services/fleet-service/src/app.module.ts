import { Module } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service';
import { FleetAuditService } from './audit/audit.service';
import { OutboxService } from './outbox/outbox.service';
import { CollectionReadinessClient } from './collection/collection-readiness.client';
import { LorriesController } from './lorries/lorries.controller';
import { LorriesService } from './lorries/lorries.service';
import { RoutesController } from './routes/routes.controller';
import { RoutesService } from './routes/routes.service';
import { AssignmentsController } from './assignments/assignments.controller';
import { AssignmentsService } from './assignments/assignments.service';
import { TripsController } from './trips/trips.controller';
import { TripsService } from './trips/trips.service';

@Module({
  controllers: [LorriesController, RoutesController, AssignmentsController, TripsController],
  providers: [
    PrismaService,
    FleetAuditService,
    OutboxService,
    CollectionReadinessClient,
    LorriesService,
    RoutesService,
    AssignmentsService,
    TripsService,
  ],
})
export class AppModule {}
