import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission, contextFrom } from '../common/request';
import { SyncService, type SyncPushInput } from './sync.service';

@Controller('sync')
export class SyncController {
  constructor(private readonly sync: SyncService) {}

  @Post('push')
  push(@Body() body: SyncPushInput, @Req() req: Request) {
    assertPermission(req, 'collection:record');
    return this.sync.push(body, contextFrom(req));
  }

  @Get('pull')
  pull(@Query('since') since: string | undefined, @Query('limit') limit: string | undefined, @Req() req: Request) {
    assertPermission(req, 'collection:record');
    return this.sync.pull(since, limit);
  }
}
