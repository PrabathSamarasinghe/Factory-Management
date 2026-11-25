import { Body, Controller, HttpCode, HttpStatus, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertConsentWithdrawalEvent } from '../events/consent.events';
import { assertInternalServiceToken } from '../events/internal-auth';
import { ConsentWithdrawalService } from './consent-withdrawal.service';

@Controller('internal')
export class ConsentWithdrawalController {
  constructor(private readonly service: ConsentWithdrawalService) {}

  @Post('consent-withdrawals')
  @HttpCode(HttpStatus.OK)
  async handle(@Body() body: unknown, @Req() req: Request) {
    assertInternalServiceToken(req);
    assertConsentWithdrawalEvent(body);
    return this.service.handle(body);
  }
}
