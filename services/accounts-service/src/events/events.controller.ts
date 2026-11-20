import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { EventEnvelope } from '@galatura/platform-kit';
import { assertPermission, assertServiceToken } from '../common/request';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post('ingest')
  async ingest(@Req() req: Request, @Body() event: EventEnvelope<any>) {
    assertPermission(req, 'ledger:ingest');
    assertServiceToken(req);
    return { data: await this.events.ingest(event) };
  }
}
