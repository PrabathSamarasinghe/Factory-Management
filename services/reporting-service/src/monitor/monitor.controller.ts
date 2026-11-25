import { Controller, Get, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission } from '../common/request';
import { MonitorService } from './monitor.service';

@Controller('monitor')
export class MonitorController {
  constructor(private readonly monitor: MonitorService) {}

  @Get('today')
  today(@Req() req: Request) {
    assertPermission(req, 'monitor:read');
    return { data: this.monitor.today() };
  }

  @Get('trips')
  trips(@Req() req: Request) {
    assertPermission(req, 'monitor:read');
    return { data: this.monitor.trips() };
  }

  @Get('attendance')
  attendance(@Req() req: Request, @Query('date') date?: string) {
    assertPermission(req, 'monitor:read');
    return { data: this.monitor.attendance(date) };
  }

  @Get('collections')
  collections(@Req() req: Request, @Query('date') date?: string) {
    assertPermission(req, 'monitor:read');
    return { data: this.monitor.collections(date) };
  }

  @Get('finance')
  finance(@Req() req: Request) {
    assertPermission(req, 'monitor:finance');
    return { data: this.monitor.finance() };
  }

  @Get('inventory')
  inventory(@Req() req: Request) {
    assertPermission(req, 'monitor:read');
    return { data: this.monitor.inventory() };
  }

  @Get('rebuild')
  rebuild(@Req() req: Request) {
    assertPermission(req, 'monitor:read');
    return { data: this.monitor.rebuild() };
  }
}
