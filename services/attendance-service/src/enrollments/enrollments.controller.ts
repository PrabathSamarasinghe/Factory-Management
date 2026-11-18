import { Body, Controller, Get, Param, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { assertPermission, readActorId, readIp } from '../common/request';
import { EnrollmentsService, type EnrolFaceInput } from './enrollments.service';

@Controller('enrollments')
export class EnrollmentsController {
  constructor(private readonly enrollments: EnrollmentsService) {}

  @Post()
  enrol(@Body() body: EnrolFaceInput, @Req() req: Request) {
    assertPermission(req, 'face:enroll');
    return this.enrollments.enrol(body, { actorId: readActorId(req), ip: readIp(req) });
  }

  @Post(':personId/revoke')
  revoke(
    @Param('personId') personId: string,
    @Body() body: { reason?: string },
    @Req() req: Request,
  ) {
    assertPermission(req, 'face:revoke');
    return this.enrollments.revoke(personId, body.reason, {
      actorId: readActorId(req),
      ip: readIp(req),
    });
  }

  @Get(':personId/status')
  status(@Param('personId') personId: string, @Req() req: Request) {
    assertPermission(req, 'face:read');
    return this.enrollments.status(personId);
  }
}
