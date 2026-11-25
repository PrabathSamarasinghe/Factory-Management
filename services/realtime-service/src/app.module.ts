import { Module } from '@nestjs/common';
import { HealthController } from './health.controller';
import { PrismaService } from './prisma/prisma.service';
import { AuditService } from './audit/audit.service';
import { EventsService } from './events/events.service';
import { EventsController } from './events/events.controller';
import { TicketsService } from './tickets/tickets.service';
import { TicketsController } from './tickets/tickets.controller';
import { RealtimeGateway } from './ws/realtime.gateway';
import { WebhookService } from './webhooks/webhooks.service';
import { WebhookSubscriptionsController } from './webhooks/webhooks.controller';
import { InboundWebhookController } from './webhooks/inbound.controller';
import { FcmService } from './push/fcm.service';
import { PushController } from './push/push.controller';

@Module({
  controllers: [
    HealthController,
    TicketsController,
    EventsController,
    WebhookSubscriptionsController,
    InboundWebhookController,
    PushController,
  ],
  providers: [
    PrismaService,
    AuditService,
    TicketsService,
    RealtimeGateway,
    WebhookService,
    FcmService,
    EventsService,
  ],
})
export class AppModule {}
