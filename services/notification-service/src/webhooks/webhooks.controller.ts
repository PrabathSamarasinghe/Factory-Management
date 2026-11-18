import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { WebhookService } from './webhook.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhookService) {}

  @Post('sms')
  async handle(@Req() req: Request, @Body() body: Record<string, unknown>) {
    return this.webhooks.handle(req, body);
  }
}
