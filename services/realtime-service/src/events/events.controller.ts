import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import type { EventEnvelope } from '@galatura/platform-kit';
import { assertAnyPermission, assertServiceToken, readPermissions } from '../common/request';
import { requiredString } from '../common/validation';
import { EventsService } from './events.service';
import { permissionsForChannel } from './channel-map';

@Controller('events')
export class EventsController {
  constructor(private readonly events: EventsService) {}

  @Post('ingest')
  async ingest(@Req() req: Request, @Body() event: EventEnvelope<any>) {
    assertServiceToken(req);
    const data = await this.events.ingest(event);
    return { data };
  }

  @Get('catch-up')
  async catchUp(
    @Req() req: Request,
    @Query('channel') channel: string,
    @Query('afterId') afterId?: string,
  ) {
    const name = requiredString(channel, 'channel');
    assertAnyPermission(req, permissionsForChannel(name));
    const data = await this.events.catchUp({
      channel: name,
      afterId,
      permissions: readPermissions(req),
    });
    return { data };
  }
}
