import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma/prisma.service';
import { OutboxService } from './outbox/outbox.service';
import { EventsService } from './events/events.service';
import { EventsController } from './events/events.controller';
import { MonitorService } from './monitor/monitor.service';
import { MonitorController } from './monitor/monitor.controller';

@Module({
  controllers: [HealthController, EventsController, MonitorController],
  providers: [PrismaService, OutboxService, EventsService, MonitorService],
})
export class AppModule {}
