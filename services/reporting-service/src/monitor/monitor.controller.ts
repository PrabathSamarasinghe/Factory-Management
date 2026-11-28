import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission } from '../common/request';
import { MonitorService } from './monitor.service';

@Controller('monitor')
export class MonitorController {
  constructor(private readonly monitor: MonitorService) {}

  @Get('today')
  async today(@Req() req: Request) {
    assertPermission(req, 'monitor:read');
    return { data: await this.monitor.today() };
  }

  @Get('trips')
  async trips(@Req() req: Request) {
    assertPermission(req, 'monitor:read');
    return { data: await this.monitor.trips() };
  }

  @Get('attendance')
  async attendance(@Req() req: Request, @Query('date') date?: string) {
    assertPermission(req, 'monitor:read');
    return { data: await this.monitor.attendance(date) };
  }

  @Get('collections')
  async collections(@Req() req: Request, @Query('date') date?: string) {
    assertPermission(req, 'monitor:read');
    return { data: await this.monitor.collections(date) };
  }

  @Get('finance')
  async finance(@Req() req: Request) {
    assertPermission(req, 'monitor:finance');
    return { data: await this.monitor.finance() };
  }

  @Get('inventory')
  async inventory(@Req() req: Request) {
    assertPermission(req, 'monitor:read');
    return { data: await this.monitor.inventory() };
  }

  @Get('rebuild')
  async rebuild(@Req() req: Request) {
    assertPermission(req, 'monitor:read');
    return { data: await this.monitor.rebuild() };
  }
}
