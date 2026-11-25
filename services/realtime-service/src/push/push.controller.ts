import { Body, Controller, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertAuthenticated, assertPermission } from '../common/request';
import { FcmService } from './fcm.service';

@Controller('push')
export class PushController {
  constructor(private readonly push: FcmService) {}

  @Post('tokens')
  async register(@Req() req: Request, @Body() body: any) {
    const principalId = assertAuthenticated(req);
    const data = await this.push.registerToken({ ...body, principalId });
    return { data };
  }

  @Post('test')
  async test(@Req() req: Request) {
    assertPermission(req, 'monitor:read');
    const principalId = assertAuthenticated(req);
    const data = await this.push.test(principalId);
    return { data };
  }
}
