import { Body, Controller, Get, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission } from '../common/request';
import { DailyAttendanceService } from './daily-attendance.service';

@Controller()
export class DaysController {
  constructor(private readonly daily: DailyAttendanceService) {}

  @Get('days')
  listDays(
    @Query('personId') personId: string | undefined,
    @Query('from') from: string | undefined,
    @Query('to') to: string | undefined,
    @Req() req: Request,
  ) {
    assertPermission(req, 'attendance:read');
    return this.daily.listDays({ personId, from, to });
  }

  @Get('days/summary')
  summary(@Query('date') date: string, @Req() req: Request) {
    assertPermission(req, 'attendance:read');
    return this.daily.summary(date);
  }

  @Post('days/close')
  close(@Body() body: { date: string }, @Req() req: Request) {
    assertPermission(req, 'attendance:close');
    return this.daily.closeDate(body.date);
  }

  @Get('reports/monthly')
  monthly(
    @Query('month') month: string,
    @Query('personId') personId: string | undefined,
    @Req() req: Request,
  ) {
    assertPermission(req, 'attendance:report');
    return this.daily.monthlyReport(month, personId);
  }
}
