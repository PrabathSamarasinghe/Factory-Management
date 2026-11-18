import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission, contextFrom } from '../common/request';
import {
  AssignmentsService,
  type ChangeAssignmentInput,
  type CreateAssignmentInput,
} from './assignments.service';

@Controller()
export class AssignmentsController {
  constructor(private readonly assignments: AssignmentsService) {}

  @Get('assignments')
  list(
    @Query('routeId') routeId: string | undefined,
    @Query('lorryId') lorryId: string | undefined,
    @Query('date') date: string | undefined,
    @Query('status') status: string | undefined,
    @Req() req: Request,
  ) {
    assertPermission(req, 'assignment:read');
    return this.assignments.list({ routeId, lorryId, date, status });
  }

  @Post('assignments')
  create(@Body() body: CreateAssignmentInput, @Req() req: Request) {
    assertPermission(req, 'assignment:create');
    return this.assignments.create(body, contextFrom(req));
  }

  @Post('assignments/:id/change')
  change(@Param('id') id: string, @Body() body: ChangeAssignmentInput, @Req() req: Request) {
    assertPermission(req, 'assignment:change');
    return this.assignments.change(id, body, contextFrom(req));
  }
}
