import { Module } from '@nestjs/common';
import { AuditService } from './audit/audit.service';
import { CollectionStatusService } from './collection/collection-status.service';
import { EventsController } from './events/events.controller';
import { EventsService } from './events/events.service';
import { HealthController } from './health.controller';
import { OutboxService } from './outbox/outbox.service';
import { PeopleService } from './people/people.service';
import { PhoneService } from './phone/phone.service';
import { PrismaService } from './prisma/prisma.service';
import { SmsProviderService } from './provider/sms-provider.service';
import { SmsController } from './sms/sms.controller';
import { SmsDispatchService } from './sms/sms-dispatch.service';
import { SmsService } from './sms/sms.service';
import { TemplatesController } from './templates/templates.controller';
import { TemplatesService } from './templates/templates.service';
import { WebhooksController } from './webhooks/webhooks.controller';
import { WebhookService } from './webhooks/webhook.service';
import { SmsWorkerService } from './worker/sms-worker.service';

@Module({
  controllers: [
    EventsController,
    HealthController,
    SmsController,
    TemplatesController,
    WebhooksController,
  ],
  providers: [
    AuditService,
    CollectionStatusService,
    EventsService,
    OutboxService,
    PeopleService,
    PhoneService,
    PrismaService,
    SmsProviderService,
    SmsDispatchService,
    SmsService,
    SmsWorkerService,
    TemplatesService,
    WebhookService,
  ],
})
export class AppModule {}
