import { Body, Controller, Delete, Get, Param, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission, readActorId } from '../common/request';
import { WebhookService } from './webhooks.service';

@Controller('webhook-subscriptions')
export class WebhookSubscriptionsController {
  constructor(private readonly webhooks: WebhookService) {}

  @Get()
  list(@Req() req: Request) {
    assertPermission(req, 'webhook:manage');
    return this.webhooks.list().then((data) => ({ data }));
  }

  @Get(':id')
  get(@Req() req: Request, @Param('id') id: string) {
    assertPermission(req, 'webhook:manage');
    return this.webhooks.get(id).then((data) => ({ data }));
  }

  @Post()
  create(@Req() req: Request, @Body() body: any) {
    assertPermission(req, 'webhook:manage');
    return this.webhooks.create(body, readActorId(req)).then((data) => ({ data }));
  }

  @Patch(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    assertPermission(req, 'webhook:manage');
    return this.webhooks.update(id, body).then((data) => ({ data }));
  }

  @Delete(':id')
  remove(@Req() req: Request, @Param('id') id: string) {
    assertPermission(req, 'webhook:manage');
    return this.webhooks.remove(id).then((data) => ({ data }));
  }

  @Post(':id/test')
  test(@Req() req: Request, @Param('id') id: string) {
    assertPermission(req, 'webhook:manage');
    return this.webhooks.sendTest(id).then((data) => ({ data }));
  }
}
