import { Body, Controller, Get, Param, Post, Put, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission, contextFrom } from '../common/request';
import { SmsService } from './sms.service';

@Controller()
export class SmsController {
  constructor(private readonly sms: SmsService) {}

  @Get('sms')
  async list(@Req() req: Request, @Query() query: Record<string, string | undefined>) {
    assertPermission(req, 'sms:read');
    return this.sms.list(query);
  }

  @Get('sms/dead-letters')
  async deadLetters(@Req() req: Request) {
    assertPermission(req, 'sms:review');
    return { data: await this.sms.listDeadLetters() };
  }

  @Post('sms/dead-letters/:id/replay')
  async replay(@Req() req: Request, @Param('id') id: string) {
    assertPermission(req, 'sms:resend');
    return { data: await this.sms.replayDeadLetter(id, contextFrom(req).actorId) };
  }

  @Get('sms/:id')
  async get(@Req() req: Request, @Param('id') id: string) {
    assertPermission(req, 'sms:read');
    return { data: await this.sms.get(id) };
  }

  @Post('sms/resend/:id')
  async resend(@Req() req: Request, @Param('id') id: string) {
    assertPermission(req, 'sms:resend');
    return { data: await this.sms.resend(id, contextFrom(req).actorId) };
  }
}
