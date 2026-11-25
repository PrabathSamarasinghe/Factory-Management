import { Body, Controller, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { WebhookService } from './webhooks.service';

@Controller('webhooks')
export class InboundWebhookController {
  constructor(private readonly webhooks: WebhookService) {}

  @Post('inbound/:provider')
  async handle(@Req() req: Request, @Param('provider') provider: string, @Body() body: unknown) {
    const data = await this.webhooks.handleInbound(provider, req, body);
    return { data };
  }
}
