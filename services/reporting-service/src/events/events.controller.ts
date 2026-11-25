import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { EventEnvelope } from '@galatura/platform-kit';
import { assertAnyPermission, assertServiceToken, hasServiceToken } from '../common/request';
import { EventsService } from './events.service';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post('ingest')
  async ingest(@Req() req: Request, @Body() event: EventEnvelope<any>) {
    if (hasServiceToken(req)) {
      assertServiceToken(req);
    } else {
      assertAnyPermission(req, ['monitor:read']);
    }
    return { data: await this.events.ingest(event) };
  }
}
