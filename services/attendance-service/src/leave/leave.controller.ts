import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission, readActorId, readIp } from '../common/request';
import {
  LeaveService,
  type CreateLeaveRequestInput,
  type CreateLeaveTypeInput,
} from './leave.service';

@Controller()
export class LeaveController {
  constructor(private readonly leave: LeaveService) {}

  @Get('leave-types')
  listLeaveTypes(@Req() req: Request) {
    assertPermission(req, 'leave:read');
    return this.leave.listLeaveTypes();
  }

  @Post('leave-types')
  createLeaveType(@Body() body: CreateLeaveTypeInput, @Req() req: Request) {
    assertPermission(req, 'leave:manage');
    return this.leave.createLeaveType(body);
  }

  @Get('leave-requests')
  listLeaveRequests(
    @Query('personId') personId: string | undefined,
    @Query('status') status: string | undefined,
    @Req() req: Request,
  ) {
    assertPermission(req, 'leave:read');
    return this.leave.listLeaveRequests({ personId, status });
  }

  @Post('leave-requests')
  createLeaveRequest(@Body() body: CreateLeaveRequestInput, @Req() req: Request) {
    assertPermission(req, 'leave:request');
    return this.leave.createLeaveRequest(body, {
      actorId: readActorId(req),
      ip: readIp(req),
    });
  }

  @Post('leave-requests/:id/decide')
  decide(
    @Param('id') id: string,
    @Body() body: { decision: 'APPROVED' | 'REJECTED' },
    @Req() req: Request,
  ) {
    assertPermission(req, 'leave:approve');
    return this.leave.decideLeaveRequest(id, body.decision, {
      actorId: readActorId(req),
      ip: readIp(req),
    });
  }

  @Get('holidays')
  listHolidays(@Req() req: Request) {
    assertPermission(req, 'leave:read');
    return this.leave.listHolidays();
  }

  @Post('holidays')
  createHoliday(@Body() body: { date: string; name: string }, @Req() req: Request) {
    assertPermission(req, 'leave:manage');
    return this.leave.createHoliday(body);
  }
}
