import { Body, Controller, Get, Param, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission, contextFrom } from '../common/request';
import { TemplatesService } from './templates.service';

@Controller('templates')
export class TemplatesController {
  constructor(private readonly templates: TemplatesService) {}

  @Get()
  async list(@Req() req: Request) {
    assertPermission(req, 'sms:template');
    return { data: await this.templates.list() };
  }

  @Put(':code/:language')
  async update(
    @Req() req: Request,
    @Param('code') code: string,
    @Param('language') language: string,
    @Body() body: { body?: string; active?: boolean },
  ) {
    assertPermission(req, 'sms:template');
    if (!body.body) {
      return { data: await this.templates.list() };
    }
    const actor = contextFrom(req).actorId;
    const template = await this.templates.update(code, language, body.body, body.active ?? true);
    return {
      data: {
        code: template.code,
        language: template.language,
        body: template.body,
        active: template.active,
        updatedBy: actor ?? null,
      },
    };
  }
}
