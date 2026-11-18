import { Body, Controller, Get, Param, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission } from '../common/request';
import {
  ShiftsService,
  type CreateShiftAssignmentInput,
  type CreateShiftInput,
} from './shifts.service';

@Controller()
export class ShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get('shifts')
  listShifts(@Query('active') active: string | undefined, @Req() req: Request) {
    assertPermission(req, 'shift:read');
    return this.shifts.listShifts(active === undefined ? undefined : active === 'true');
  }

  @Post('shifts')
  createShift(@Body() body: CreateShiftInput, @Req() req: Request) {
    assertPermission(req, 'shift:manage');
    return this.shifts.createShift(body);
  }

  @Patch('shifts/:id')
  updateShift(
    @Param('id') id: string,
    @Body() body: Partial<CreateShiftInput> & { active?: boolean },
    @Req() req: Request,
  ) {
    assertPermission(req, 'shift:manage');
    return this.shifts.updateShift(id, body);
  }

  @Get('shift-assignments')
  listAssignments(@Query('personId') personId: string | undefined, @Req() req: Request) {
    assertPermission(req, 'shift:read');
    return this.shifts.listAssignments(personId);
  }

  @Post('shift-assignments')
  createAssignment(@Body() body: CreateShiftAssignmentInput, @Req() req: Request) {
    assertPermission(req, 'shift:manage');
    return this.shifts.createAssignment(body);
  }

  @Patch('shift-assignments/:id')
  updateAssignment(
    @Param('id') id: string,
    @Body() body: { effectiveFrom?: string; effectiveTo?: string | null; shiftId?: string },
    @Req() req: Request,
  ) {
    assertPermission(req, 'shift:manage');
    return this.shifts.updateAssignment(id, body);
  }
}
