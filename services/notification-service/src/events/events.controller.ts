import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { EventEnvelope } from '@galatura/platform-kit';
import { assertPermission, assertServiceToken } from '../common/request';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post('collection-finalized')
  async ingest(@Req() req: Request, @Body() event: EventEnvelope) {
    assertPermission(req, 'sms:ingest');
    assertServiceToken(req);
    return { data: await this.events.ingestCollectionFinalized(event) };
  }
}
