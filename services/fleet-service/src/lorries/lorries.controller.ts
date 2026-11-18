import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission, contextFrom } from '../common/request';
import {
  LorriesService,
  type CreateDocumentInput,
  type CreateLorryInput,
  type CreateMaintenanceInput,
  type UpdateLorryInput,
} from './lorries.service';

@Controller()
export class LorriesController {
  constructor(private readonly lorries: LorriesService) {}

  @Get('lorries')
  list(
    @Query('status') status: string | undefined,
    @Query('q') q: string | undefined,
    @Req() req: Request,
  ) {
    assertPermission(req, 'lorry:read');
    return this.lorries.list({ status, q });
  }

  @Get('lorries/alerts')
  alerts(@Req() req: Request) {
    assertPermission(req, 'lorry:read');
    return this.lorries.alerts();
  }

  @Get('lorries/:id')
  get(@Param('id') id: string, @Req() req: Request) {
    assertPermission(req, 'lorry:read');
    return this.lorries.get(id);
  }

  @Post('lorries')
  create(@Body() body: CreateLorryInput, @Req() req: Request) {
    assertPermission(req, 'lorry:create');
    return this.lorries.create(body, contextFrom(req));
  }

  @Patch('lorries/:id')
  update(@Param('id') id: string, @Body() body: UpdateLorryInput, @Req() req: Request) {
    assertPermission(req, 'lorry:update');
    return this.lorries.update(id, body, contextFrom(req));
  }

  @Post('lorries/:id/documents')
  addDocument(@Param('id') id: string, @Body() body: CreateDocumentInput, @Req() req: Request) {
    assertPermission(req, 'lorry:update');
    return this.lorries.addDocument(id, body, contextFrom(req));
  }

  @Post('lorries/:id/maintenance')
  addMaintenance(
    @Param('id') id: string,
    @Body() body: CreateMaintenanceInput,
    @Req() req: Request,
  ) {
    assertPermission(req, 'lorry:update');
    return this.lorries.addMaintenance(id, body, contextFrom(req));
  }
}
