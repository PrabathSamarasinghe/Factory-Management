import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission, readActorId, readIp } from '../common/request';
import { MarkingService, type ManualMarkInput, type MarkInput } from './marking.service';

@Controller()
export class MarkingController {
  constructor(private readonly marking: MarkingService) {}

  @Post('mark')
  mark(@Body() body: MarkInput, @Req() req: Request) {
    assertPermission(req, 'attendance:mark');
    return this.marking.mark(body, { actorId: readActorId(req), ip: readIp(req) });
  }

  @Post('mark/manual')
  manual(@Body() body: ManualMarkInput, @Req() req: Request) {
    assertPermission(req, 'attendance:manual');
    return this.marking.markManual(body, { actorId: readActorId(req), ip: readIp(req) });
  }

  @Get('events')
  listEvents(
    @Query('personId') personId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Req() req: Request,
  ) {
    assertPermission(req, 'attendance:read');
    return this.marking.listEvents({ personId, from, to });
  }
}
