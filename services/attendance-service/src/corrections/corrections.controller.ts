import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission, readActorId, readIp } from '../common/request';
import { CorrectionsService, type CreateCorrectionInput } from './corrections.service';

@Controller('corrections')
export class CorrectionsController {
  constructor(private readonly corrections: CorrectionsService) {}

  @Post()
  create(@Body() body: CreateCorrectionInput, @Req() req: Request) {
    assertPermission(req, 'attendance:correct');
    return this.corrections.create(body, { actorId: readActorId(req), ip: readIp(req) });
  }

  @Get()
  list(
    @Query('personId') personId: string | undefined,
    @Query('status') status: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Req() req: Request,
  ) {
    assertPermission(req, 'attendance:read');
    return this.corrections.list({ personId, status, from, to });
  }

  @Post(':id/approve')
  approve(@Param('id') id: string, @Req() req: Request) {
    assertPermission(req, 'attendance:approve');
    return this.corrections.approve(id, { actorId: readActorId(req), ip: readIp(req) });
  }

  @Post(':id/reject')
  reject(@Param('id') id: string, @Req() req: Request) {
    assertPermission(req, 'attendance:approve');
    return this.corrections.reject(id, { actorId: readActorId(req), ip: readIp(req) });
  }
}
