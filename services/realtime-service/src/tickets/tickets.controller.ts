import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertAuthenticated, readPermissions } from '../common/request';
import { stringArray } from '../common/validation';
import { TicketsService } from './tickets.service';

@Controller('tickets')
export class TicketsController {
  constructor(private readonly tickets: TicketsService) {}

  @Post()
  issue(@Req() req: Request, @Body() body: { channels?: string[]; clientApp?: string }) {
    const principalId = assertAuthenticated(req);
    const channels =
      body?.channels === undefined ? undefined : stringArray(body.channels, 'channels');
    const result = this.tickets.issue({
      principalId,
      clientApp: body?.clientApp,
      permissions: readPermissions(req),
      channels,
    });
    return { data: result };
  }
}
